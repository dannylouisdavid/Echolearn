import { collection, addDoc, query, where, getDocs, updateDoc, doc, getDoc, arrayUnion, arrayRemove, writeBatch } from 'firebase/firestore';
import { createNotification } from './notifications';
import { db } from './firebaseConfig';
import { Invite, User } from '../types/schema';

// Send an invite
export const sendInvite = async (fromUser: User, toEmail: string, type: 'teacher_to_student' | 'student_to_teacher' | 'parent_to_student' | 'student_to_parent') => {
    const targetEmail = toEmail.toLowerCase().trim();

    // 1. Verify recipient email exists
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', targetEmail));
    const snap = await getDocs(q);

    if (snap.empty) {
        throw new Error("User with this email not found.");
    }

    const recipientData = snap.docs[0].data();
    const recipientUid = snap.docs[0].id;
    const recipientRole = recipientData.role;

    // 2. Block student-to-student invites
    if (type === 'student_to_teacher' && recipientRole === 'student') {
        throw new Error("You can only send invites to teachers, not other students.");
    }

    // 3a. Block teacher inviting another teacher
    if (type === 'teacher_to_student' && recipientRole === 'teacher') {
        throw new Error("You can only invite students, not other teachers.");
    }

    // 3b. Block parent inviting anyone but student
    if (type === 'parent_to_student' && recipientRole !== 'student') {
        throw new Error("Parents can only link with students.");
    }

    // 3c. Block student inviting anyone but teacher or parent
    if (type === 'student_to_parent' && recipientRole !== 'parent') {
        throw new Error("You can only invite parents with this action.");
    }

    // 4. Check if already linked
    const senderDoc = await getDoc(doc(db, 'users', fromUser.uid));
    if (senderDoc.exists()) {
        const senderData = senderDoc.data();
        const linkedTeachers = senderData.linkedTeachers || [];
        const linkedStudents = senderData.linkedStudents || [];
        const linkedParents = senderData.linkedParents || [];

        if (linkedTeachers.includes(recipientUid) || linkedStudents.includes(recipientUid) || linkedParents.includes(recipientUid)) {
            throw new Error("You are already connected with this user.");
        }
    }

    // 5. Check for existing pending invite (prevent duplicates)
    const existingInviteQ = query(
        collection(db, 'invites'),
        where('fromUid', '==', fromUser.uid),
        where('toEmail', '==', targetEmail),
        where('status', '==', 'pending')
    );
    const existingSnap = await getDocs(existingInviteQ);

    if (!existingSnap.empty) {
        throw new Error("Invite already in progress. Waiting for their response.");
    }
    // Note: Rejected invites don't block - allows resending

    // 6. Create Invite
    const inviteData: Omit<Invite, 'id'> = {
        fromUid: fromUser.uid,
        fromName: fromUser.displayName,
        toEmail: targetEmail,
        type: type,
        status: 'pending',
        createdAt: Date.now()
    };

    const inviteRef = await addDoc(collection(db, 'invites'), inviteData);

    // 7. Send Notification to Recipient
    await createNotification(
        recipientUid,
        "New Invitation",
        `${fromUser.displayName} wants to link with you.`,
        'new_invite',
        inviteRef.id
    );
};

// Get pending invites for a user (based on their email)
export const getPendingInvites = async (userEmail: string) => {
    const q = query(
        collection(db, 'invites'),
        where('toEmail', '==', userEmail.toLowerCase().trim()),
        where('status', '==', 'pending')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Invite));
};

// Reject an invite
export const rejectInvite = async (inviteId: string) => {
    const inviteRef = doc(db, 'invites', inviteId);

    // Fetch invite to find sender
    const docSnap = await getDoc(inviteRef);
    if (!docSnap.exists()) return;
    const invite = docSnap.data() as Invite;

    await updateDoc(inviteRef, { status: 'rejected' });

    // Notify sender
    await createNotification(
        invite.fromUid,
        "Invitation Declined",
        `Your invitation to ${invite.toEmail} was declined.`,
        'invite_rejected',
        inviteId
    );
};

// Accept an invite
// Uses a batch write so all updates (invite status + both user profiles) are atomic.
export const acceptInvite = async (invite: Invite, currentUserUid: string) => {
    const batch = writeBatch(db);
    const inviteRef = doc(db, 'invites', invite.id);

    // 1. Mark as accepted
    batch.update(inviteRef, { status: 'accepted' });

    // 2. Link Users
    if (invite.type === 'parent_to_student' || invite.type === 'student_to_parent') {
        // Parent-Student Link
        let parentUid, studentUid;

        if (invite.type === 'parent_to_student') {
            parentUid = invite.fromUid;
            studentUid = currentUserUid;
        } else { // student_to_parent
            studentUid = invite.fromUid;
            parentUid = currentUserUid;
        }

        // Update Student Profile (add parent)
        batch.update(doc(db, 'users', studentUid), {
            linkedParents: arrayUnion(parentUid)
        });

        // Update Parent Profile (add student)
        batch.update(doc(db, 'users', parentUid), {
            linkedStudents: arrayUnion(studentUid)
        });

    } else {
        // Teacher/Student logic
        let teacherUid, studentUid;

        if (invite.type === 'teacher_to_student') {
            teacherUid = invite.fromUid;
            studentUid = currentUserUid;
        } else { // student_to_teacher
            teacherUid = currentUserUid;
            studentUid = invite.fromUid;
        }

        // Update Student Profile
        batch.update(doc(db, 'users', studentUid), {
            linkedTeachers: arrayUnion(teacherUid)
        });

        // Update Teacher Profile
        batch.update(doc(db, 'users', teacherUid), {
            linkedStudents: arrayUnion(studentUid)
        });
    }

    await batch.commit();
};

// Unlink user (remove connection)
// When teacher unlinks student:
// 1. Transfer teacher-created notebooks/pages to student ownership (make private)
// 2. Remove student from all teacher's groups
// 3. Remove from linked arrays
export const unlinkUser = async (teacherUid: string, studentUid: string) => {
    const batch = writeBatch(db);

    // 1. Find and update notebooks managed by this teacher for this student
    const notebooksQ = query(
        collection(db, 'notebooks'),
        where('ownerId', '==', studentUid),
        where('managedBy', '==', teacherUid)
    );
    const notebooksSnap = await getDocs(notebooksQ);

    for (const nbDoc of notebooksSnap.docs) {
        batch.update(doc(db, 'notebooks', nbDoc.id), {
            managedBy: null,  // Remove teacher management
            sharedWith: [],   // Clear sharing
            visibility: 'private'
        });
    }

    // 2. Find and update pages managed by this teacher for this student
    const pagesQ = query(
        collection(db, 'pages'),
        where('ownerId', '==', studentUid),
        where('managedBy', '==', teacherUid)
    );
    const pagesSnap = await getDocs(pagesQ);

    for (const pageDoc of pagesSnap.docs) {
        batch.update(doc(db, 'pages', pageDoc.id), {
            managedBy: null,  // Remove teacher management
            sharedWith: [],   // Clear sharing
            visibility: 'private'
        });
    }

    // 3. Remove student from all teacher's groups
    const groupsQ = query(
        collection(db, 'groups'),
        where('ownerId', '==', teacherUid),
        where('studentIds', 'array-contains', studentUid)
    );
    const groupsSnap = await getDocs(groupsQ);

    for (const groupDoc of groupsSnap.docs) {
        batch.update(doc(db, 'groups', groupDoc.id), {
            studentIds: arrayRemove(studentUid)
        });
    }

    // 4. Remove from linked arrays on both users
    batch.update(doc(db, 'users', teacherUid), {
        linkedStudents: arrayRemove(studentUid)
    });

    batch.update(doc(db, 'users', studentUid), {
        linkedTeachers: arrayRemove(teacherUid)
    });

    await batch.commit();
    // Note: After unlink, users can send invites again since they're no longer "connected"
};

// ------------------------------------------------------------------
// Invite Code Logic
// ------------------------------------------------------------------

export const generateInviteCode = (): string => {
    // Generate a simple 6-char alphanumeric code (ALL CAPS)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, 1, O, 0 for clarity
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

export const assignInviteCode = async (uid: string): Promise<string> => {
    const userRef = doc(db, 'users', uid);

    // 1. Check if code already exists (Idempotency)
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
        const userData = userSnap.data();
        if (userData.inviteCode) {
            return userData.inviteCode;
        }
    }

    let code = generateInviteCode();
    let unique = false;
    let attempts = 0;

    // Ensure uniqueness (simple check)
    while (!unique && attempts < 5) {
        const q = query(collection(db, 'users'), where('inviteCode', '==', code));
        const snap = await getDocs(q);
        if (snap.empty) {
            unique = true;
        } else {
            code = generateInviteCode();
            attempts++;
        }
    }

    if (!unique) throw new Error("Could not generate unique code. Please try again.");

    await updateDoc(userRef, {
        inviteCode: code
    });

    return code;
};

export const getUserByInviteCode = async (code: string): Promise<User | null> => {
    const q = query(collection(db, 'users'), where('inviteCode', '==', code.toUpperCase()));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { uid: snap.docs[0].id, ...snap.docs[0].data() } as User;
};
