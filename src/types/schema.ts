export type UserRole = 'student' | 'teacher' | 'parent';

export interface User {
    uid: string;
    email: string;
    role: UserRole;
    displayName: string;
    photoURL?: string;
    createdAt: number;
    linkedTeachers?: string[];
    linkedStudents?: string[];
    linkedParents?: string[];
    inviteCode?: string; // Alphanumeric code for searching users
    onboardingCompleted?: boolean;
    subscription?: {
        status: 'trial' | 'active' | 'expired' | 'inactive';
        trialEndDate: number; // Timestamp
        planId?: string;
    };
}

export interface StudentProfile extends User {
    role: 'student';
    linkedTeachers: string[]; // Teacher UIDs
    linkedParents: string[]; // Parent UIDs
    preparationTarget?: string; // e.g., "SAT", "Math Exam", "Other"
}

export interface TeacherProfile extends User {
    role: 'teacher';
    // Academic Qualifications
    postGraduation?: string; // Comma-separated or single value
    graduation?: string; // Comma-separated or single value
    professionalCertificates?: string[]; // Array of certificates
    awards?: string[]; // Array of awards
    bio?: string; // Bio text
}

export interface ParentProfile extends User {
    role: 'parent';
    linkedStudents: string[]; // Student UIDs
}

export interface Notebook {
    id: string;
    title: string;
    ownerId: string;
    createdAt: number;
    updatedAt: number;
    type: 'general' | 'teacher_created' | 'student_created' | 'teacher_group' | 'teacher_individual' | 'teacher_group_master';
    sharedWith: string[]; // UIDs of users who can read
    managedBy?: string; // UID of teacher who owns this (if teacher_created)
    assignedGroupIds?: string[]; // Groups this notebook was assigned to
    assignedGroups?: { groupId: string; groupName: string }[]; // Group info for display (master only)
    sourceNotebookId?: string; // Links student copies to master notebook
    displayId?: string; // Optional display ID for debugging
    visibility?: 'private' | 'teacher' | 'teacher_parent'; // Student-created notebook visibility
    sharedWithParents?: string[]; // UIDs of parents who can read
}


export interface Page {
    id: string;
    notebookId: string;
    title: string;
    ownerId: string;
    createdAt: number;
    updatedAt: number;

    // Learning Data
    plannedTimeMinutes: number;
    actualTimeMinutes?: number;
    currentSessionStart?: number; // Timestamp for active session tracking (offline support)
    isCompleted: boolean;
    completedAt?: number;

    // Active Recall & SM-18
    difficulty?: number; // 0-1 (internally mapped from 1-10)
    retentionTarget?: number; // e.g., 0.9 (90%)
    nextReviewDate?: number; // Timestamp
    repetitionCount: number;
    interval: number; // Days
    rFactor: number; // Retrievability Factor (internal SM-18)

    // Content
    contentJson?: string;

    attachments: Attachment[];

    // Sharing (Page-Level)
    visibility?: 'private' | 'teacher';
    sharedWith?: string[];         // Teacher UIDs
    sharedWithParents?: string[];
    managedBy?: string;            // Teacher UID if page created by teacher
}

export interface Attachment {
    id: string;
    type: 'image' | 'pdf' | 'link' | 'audio' | 'other';
    url: string;
    name: string;
    sizeBytes?: number;
}

export type Group = {
    id: string;
    ownerId: string; // Teacher ID
    name: string;
    studentIds: string[];
}

export interface Invite {
    id: string;
    fromUid: string;
    fromName: string;
    toEmail: string;
    type: 'teacher_to_student' | 'student_to_teacher' | 'parent_to_student' | 'student_to_parent';
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: number;
}

export interface Notification {
    id: string;
    userId: string;
    title: string;
    message: string;
    type: 'invite_rejected' | 'invite_accepted' | 'topic_assigned' | 'notebook_assigned' | 'group_added' | 'comment_added' | 'other';
    read: boolean;
    createdAt: number;
    relatedId?: string; // e.g. inviteId
    data?: any;
}

export interface Comment {
    id: string;
    threadId: string; // Page ID
    content: string;
    authorId: string;
    authorRole: UserRole; // 'student' | 'teacher' | 'parent'
    authorName: string;
    createdAt: number;
    readBy: string[]; // UIDs of users who read this
    visibility: 'teacher_student' | 'parent_student';
}

// Arrow Connector Types
export type AnchorPosition =
    | 'top-left' | 'top' | 'top-right'
    | 'left' | 'right'
    | 'bottom-left' | 'bottom' | 'bottom-right';

export interface Arrow {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    sourceAnchor: AnchorPosition;
    targetAnchor: AnchorPosition;
    lineType: 'straight' | 'curved';
    arrowEnds: 'none' | 'end' | 'both';
    lineStyle: 'solid' | 'dotted';
    label?: string;
    color?: string;
}

// Messaging System
export interface Conversation {
    id: string;
    participants: string[]; // [TeacherUID, ParentUID]
    participantRoles: { [uid: string]: 'teacher' | 'parent' };
    lastMessage: string;
    lastMessageAt: number; // Timestamp
    unreadCounts: { [uid: string]: number };
    relatedStudentId?: string; // Optional context
    relatedStudentName?: string;
    teacherId?: string; // Helper for queries
    parentId?: string; // Helper for queries
}

export interface Message {
    id: string;
    conversationId: string;
    senderId: string;
    text: string;
    createdAt: number; // Timestamp
    readBy: string[];
    type: 'text' | 'broadcast';
    broadcastGroupId?: string; // ID of the group if it was a broadcast
}
