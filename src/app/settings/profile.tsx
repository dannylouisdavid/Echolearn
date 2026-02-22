import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert, Image } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../services/auth/AuthContext';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StudentProfile, ParentProfile, TeacherProfile } from '../../types/schema';

const EXAM_OPTIONS = ["SAT", "GRE", "GMAT", "MCAT", "Board Exams", "Computer Science", "Medical", "Law", "UPSC", "Other"];
const POST_GRAD_OPTIONS = ["M.Ed", "M.A.", "M.Sc.", "M.Phil", "Ph.D.", "MBA", "Other"];
const GRAD_OPTIONS = ["B.Ed", "B.A.", "B.Sc.", "B.Com", "B.Tech", "BBA", "Other"];

export default function ProfileSettings() {
    const { user, userProfile, refreshProfile } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Editable Fields
    const [displayName, setDisplayName] = useState('');

    // Prep Target is now managed as an array of selected strings
    const [selectedExams, setSelectedExams] = useState<string[]>([]);
    const [otherText, setOtherText] = useState('');

    // Connections (Student)
    const [teachers, setTeachers] = useState<{ id: string, name: string }[]>([]);
    const [parents, setParents] = useState<{ id: string, name: string }[]>([]);

    // Connections (Parent)
    const [children, setChildren] = useState<{ id: string, name: string, photoURL?: string }[]>([]);

    // Teacher Qualifications
    const [selectedPostGrad, setSelectedPostGrad] = useState<string[]>([]);
    const [postGradOther, setPostGradOther] = useState('');
    const [selectedGrad, setSelectedGrad] = useState<string[]>([]);
    const [gradOther, setGradOther] = useState('');
    const [certificates, setCertificates] = useState<string[]>(['']);
    const [awards, setAwards] = useState<string[]>(['']);
    const [bio, setBio] = useState('');

    useEffect(() => {
        if (user && userProfile) {
            setDisplayName(userProfile.displayName || '');

            if (userProfile.role === 'student') {
                const targetStr = (userProfile as StudentProfile).preparationTarget || '';
                if (targetStr) {
                    const targets = targetStr.split(',').map(s => s.trim());
                    // Separate "Other" inputs
                    const known = targets.filter(t => EXAM_OPTIONS.includes(t) && t !== 'Other');
                    const others = targets.filter(t => !EXAM_OPTIONS.includes(t));

                    const newSelected = [...known];
                    if (others.length > 0) {
                        newSelected.push('Other');
                        setOtherText(others.join(', '));
                    }
                    setSelectedExams(newSelected);
                }
            } else if (userProfile.role === 'teacher') {
                const profile = userProfile as TeacherProfile;

                // Parse Post Graduation
                if (profile.postGraduation) {
                    const postGradList = profile.postGraduation.split(',').map(s => s.trim());
                    const knownPG = postGradList.filter(t => POST_GRAD_OPTIONS.includes(t) && t !== 'Other');
                    const othersPG = postGradList.filter(t => !POST_GRAD_OPTIONS.includes(t));
                    const newSelectedPG = [...knownPG];
                    if (othersPG.length > 0) {
                        newSelectedPG.push('Other');
                        setPostGradOther(othersPG.join(', '));
                    }
                    setSelectedPostGrad(newSelectedPG);
                }

                // Parse Graduation
                if (profile.graduation) {
                    const gradList = profile.graduation.split(',').map(s => s.trim());
                    const knownG = gradList.filter(t => GRAD_OPTIONS.includes(t) && t !== 'Other');
                    const othersG = gradList.filter(t => !GRAD_OPTIONS.includes(t));
                    const newSelectedG = [...knownG];
                    if (othersG.length > 0) {
                        newSelectedG.push('Other');
                        setGradOther(othersG.join(', '));
                    }
                    setSelectedGrad(newSelectedG);
                }

                // Certificates and Awards
                if (profile.professionalCertificates?.length) {
                    setCertificates(profile.professionalCertificates);
                }
                if (profile.awards?.length) {
                    setAwards(profile.awards);
                }
                if (profile.bio) {
                    setBio(profile.bio);
                }
            }
            fetchConnections();
        }
    }, [user, userProfile]);

    const fetchConnections = async () => {
        setLoading(true);
        if (!user || !userProfile) {
            setLoading(false);
            return;
        }

        try {
            if (userProfile.role === 'student') {
                const profile = userProfile as StudentProfile;
                const teacherList: { id: string, name: string }[] = [];
                const parentList: { id: string, name: string }[] = [];

                // Fetch Teachers
                if (profile.linkedTeachers?.length) {
                    const snaps = await Promise.all(profile.linkedTeachers.map(id => getDoc(doc(db, 'users', id))));
                    snaps.forEach(snap => {
                        if (snap.exists()) teacherList.push({ id: snap.id, name: snap.data().displayName || 'Teacher' });
                    });
                }

                // Fetch Parents
                if (profile.linkedParents?.length) {
                    const snaps = await Promise.all(profile.linkedParents.map(id => getDoc(doc(db, 'users', id))));
                    snaps.forEach(snap => {
                        if (snap.exists()) parentList.push({ id: snap.id, name: snap.data().displayName || 'Parent' });
                    });
                }

                setTeachers(teacherList);
                setParents(parentList);

            } else if (userProfile.role === 'parent') {
                const profile = userProfile as ParentProfile;
                const childList: { id: string, name: string, photoURL?: string }[] = [];

                // Fetch Children (Linked Students)
                if (profile.linkedStudents?.length) {
                    const snaps = await Promise.all(profile.linkedStudents.map(id => getDoc(doc(db, 'users', id))));
                    snaps.forEach(snap => {
                        if (snap.exists()) {
                            const data = snap.data();
                            childList.push({ id: snap.id, name: data.displayName || 'Student', photoURL: data.photoURL });
                        }
                    });
                }

                setChildren(childList);
            }
        } catch (e) {
            console.error("Error fetching connections", e);
        } finally {
            setLoading(false);
        }
    };

    const toggleExam = (exam: string) => {
        if (selectedExams.includes(exam)) {
            setSelectedExams(selectedExams.filter(e => e !== exam));
        } else {
            setSelectedExams([...selectedExams, exam]);
        }
    };

    // Teacher qualification toggles
    const togglePostGrad = (option: string) => {
        if (selectedPostGrad.includes(option)) {
            setSelectedPostGrad(selectedPostGrad.filter(o => o !== option));
        } else {
            setSelectedPostGrad([...selectedPostGrad, option]);
        }
    };

    const toggleGrad = (option: string) => {
        if (selectedGrad.includes(option)) {
            setSelectedGrad(selectedGrad.filter(o => o !== option));
        } else {
            setSelectedGrad([...selectedGrad, option]);
        }
    };

    // Dynamic certificate handlers
    const addCertificate = () => setCertificates([...certificates, '']);
    const updateCertificate = (index: number, value: string) => {
        const updated = [...certificates];
        updated[index] = value;
        setCertificates(updated);
    };
    const removeCertificate = (index: number) => {
        if (certificates.length > 1) setCertificates(certificates.filter((_, i) => i !== index));
    };

    // Dynamic award handlers
    const addAward = () => setAwards([...awards, '']);
    const updateAward = (index: number, value: string) => {
        const updated = [...awards];
        updated[index] = value;
        setAwards(updated);
    };
    const removeAward = (index: number) => {
        if (awards.length > 1) setAwards(awards.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            let updateData: any = { displayName };

            if (userProfile?.role === 'student') {
                const targets = selectedExams.filter(e => e !== 'Other');
                if (selectedExams.includes('Other') && otherText.trim()) {
                    targets.push(otherText.trim());
                }
                updateData.preparationTarget = targets.join(', ');
            } else if (userProfile?.role === 'teacher') {
                // Build post graduation string
                let postGradList = selectedPostGrad.filter(o => o !== 'Other');
                if (selectedPostGrad.includes('Other') && postGradOther.trim()) {
                    postGradList.push(postGradOther.trim());
                }
                updateData.postGraduation = postGradList.join(', ');

                // Build graduation string
                let gradList = selectedGrad.filter(o => o !== 'Other');
                if (selectedGrad.includes('Other') && gradOther.trim()) {
                    gradList.push(gradOther.trim());
                }
                updateData.graduation = gradList.join(', ');

                // Filter empty certificates and awards
                updateData.professionalCertificates = certificates.filter(c => c.trim() !== '');
                updateData.awards = awards.filter(a => a.trim() !== '');
                updateData.bio = bio.trim();
            }

            await updateDoc(doc(db, 'users', user.uid), updateData);
            await refreshProfile();
            Alert.alert("Success", "Profile updated successfully!");
        } catch (e) {
            Alert.alert("Error", "Could not update profile.");
        } finally {
            setSaving(false);
        }
    };

    if (loading && !displayName) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#35c128" />
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top + 30 }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Edit Profile</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>

                {/* 1. Identity Section */}
                <View style={styles.section}>
                    <View style={styles.avatarContainer}>
                        {userProfile?.photoURL ? (
                            <Image source={{ uri: userProfile.photoURL }} style={styles.avatarImage} />
                        ) : (
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>{displayName.charAt(0) || 'U'}</Text>
                            </View>
                        )}
                    </View>

                    <Text style={styles.label}>Display Name</Text>
                    <TextInput
                        style={styles.input}
                        value={displayName}
                        onChangeText={setDisplayName}
                        placeholder="Your Name"
                        placeholderTextColor="#666"
                    />

                    <Text style={styles.label}>Email</Text>
                    <View style={[styles.input, styles.readOnly]}>
                        <Text style={{ color: '#aaa' }}>{user?.email}</Text>
                        <MaterialCommunityIcons name="lock" size={16} color="#666" />
                    </View>
                </View>

                {/* 2. Academic Focus (Student Only) */}
                {userProfile?.role === 'student' && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Academic Focus</Text>
                        <Text style={styles.label}>Preparation Target</Text>
                        <Text style={styles.helperText}>Select all exams/subjects you are preparing for.</Text>

                        <View style={styles.chipContainer}>
                            {EXAM_OPTIONS.map(exam => (
                                <TouchableOpacity
                                    key={exam}
                                    style={[styles.chip, selectedExams.includes(exam) && styles.selectedChip]}
                                    onPress={() => toggleExam(exam)}
                                >
                                    <Text style={[styles.chipText, selectedExams.includes(exam) && styles.selectedChipText]}>{exam}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {selectedExams.includes("Other") && (
                            <View style={{ marginTop: 15 }}>
                                <Text style={styles.label}>Other Exam(s)</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter exam name(s)"
                                    placeholderTextColor="#666"
                                    value={otherText}
                                    onChangeText={setOtherText}
                                />
                            </View>
                        )}
                    </View>
                )}

                {/* 3. Connections (Student Only) */}
                {userProfile?.role === 'student' && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>My Connections</Text>

                        <Text style={styles.subHeader}>Teachers</Text>
                        {teachers.length === 0 ? <Text style={styles.emptyText}>No linked teachers.</Text> : (
                            teachers.map(t => (
                                <View key={t.id} style={styles.connectionCard}>
                                    <View style={[styles.miniAvatar, { backgroundColor: '#444' }]}>
                                        <Text style={{ color: '#fff' }}>{t.name[0]}</Text>
                                    </View>
                                    <Text style={styles.connectionName}>{t.name}</Text>
                                </View>
                            ))
                        )}

                        <Text style={[styles.subHeader, { marginTop: 15 }]}>Parents / Guardians</Text>
                        {parents.length === 0 ? <Text style={styles.emptyText}>No linked parents.</Text> : (
                            parents.map(p => (
                                <View key={p.id} style={styles.connectionCard}>
                                    <View style={[styles.miniAvatar, { backgroundColor: '#444' }]}>
                                        <Text style={{ color: '#fff' }}>{p.name[0]}</Text>
                                    </View>
                                    <Text style={styles.connectionName}>{p.name}</Text>
                                </View>
                            ))
                        )}
                    </View>
                )}

                {/* 3b. Connections (Parent Only) */}
                {userProfile?.role === 'parent' && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>My Children</Text>

                        {children.length === 0 ? (
                            <Text style={styles.emptyText}>No linked children. Ask your child to send you an invite from their app.</Text>
                        ) : (
                            children.map(c => (
                                <View key={c.id} style={styles.connectionCard}>
                                    {c.photoURL ? (
                                        <Image source={{ uri: c.photoURL }} style={styles.miniAvatarImage} />
                                    ) : (
                                        <View style={[styles.miniAvatar, { backgroundColor: '#2E7D32' }]}>
                                            <Text style={{ color: '#fff', fontWeight: 'bold' }}>{c.name[0]}</Text>
                                        </View>
                                    )}
                                    <Text style={styles.connectionName}>{c.name}</Text>
                                </View>
                            ))
                        )}
                    </View>
                )}

                {/* 4. Teacher Qualifications (Teacher Only) */}
                {userProfile?.role === 'teacher' && (
                    <>
                        {/* Post Graduation */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Post Graduation</Text>
                            <View style={styles.chipContainer}>
                                {POST_GRAD_OPTIONS.map(option => (
                                    <TouchableOpacity
                                        key={option}
                                        style={[styles.chip, selectedPostGrad.includes(option) && styles.selectedChip]}
                                        onPress={() => togglePostGrad(option)}
                                    >
                                        <Text style={[styles.chipText, selectedPostGrad.includes(option) && styles.selectedChipText]}>
                                            {option}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            {selectedPostGrad.includes('Other') && (
                                <TextInput
                                    style={[styles.input, { marginTop: 10 }]}
                                    placeholder="Enter other qualification"
                                    placeholderTextColor="#666"
                                    value={postGradOther}
                                    onChangeText={setPostGradOther}
                                />
                            )}
                        </View>

                        {/* Graduation */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Graduation</Text>
                            <View style={styles.chipContainer}>
                                {GRAD_OPTIONS.map(option => (
                                    <TouchableOpacity
                                        key={option}
                                        style={[styles.chip, selectedGrad.includes(option) && styles.selectedChip]}
                                        onPress={() => toggleGrad(option)}
                                    >
                                        <Text style={[styles.chipText, selectedGrad.includes(option) && styles.selectedChipText]}>
                                            {option}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            {selectedGrad.includes('Other') && (
                                <TextInput
                                    style={[styles.input, { marginTop: 10 }]}
                                    placeholder="Enter other qualification"
                                    placeholderTextColor="#666"
                                    value={gradOther}
                                    onChangeText={setGradOther}
                                />
                            )}
                        </View>

                        {/* Professional Certificates */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Professional Certificates</Text>
                            {certificates.map((cert, index) => (
                                <View key={index} style={styles.dynamicRow}>
                                    <TextInput
                                        style={[styles.input, styles.dynamicInput]}
                                        placeholder={`Certificate ${index + 1}`}
                                        placeholderTextColor="#666"
                                        value={cert}
                                        onChangeText={(text) => updateCertificate(index, text)}
                                    />
                                    {certificates.length > 1 && (
                                        <TouchableOpacity onPress={() => removeCertificate(index)} style={styles.removeBtn}>
                                            <MaterialCommunityIcons name="minus-circle" size={24} color="#e74c3c" />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ))}
                            <TouchableOpacity onPress={addCertificate} style={styles.addBtn}>
                                <MaterialCommunityIcons name="plus-circle" size={20} color="#2E7D32" />
                                <Text style={styles.addBtnText}>Add Certificate</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Awards */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Awards & Recognitions</Text>
                            {awards.map((award, index) => (
                                <View key={index} style={styles.dynamicRow}>
                                    <TextInput
                                        style={[styles.input, styles.dynamicInput]}
                                        placeholder={`Award ${index + 1}`}
                                        placeholderTextColor="#666"
                                        value={award}
                                        onChangeText={(text) => updateAward(index, text)}
                                    />
                                    {awards.length > 1 && (
                                        <TouchableOpacity onPress={() => removeAward(index)} style={styles.removeBtn}>
                                            <MaterialCommunityIcons name="minus-circle" size={24} color="#e74c3c" />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ))}
                            <TouchableOpacity onPress={addAward} style={styles.addBtn}>
                                <MaterialCommunityIcons name="plus-circle" size={20} color="#2E7D32" />
                                <Text style={styles.addBtnText}>Add Award</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Bio */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Bio</Text>
                            <TextInput
                                style={[styles.input, styles.textArea]}
                                placeholder="Tell students about yourself, your teaching philosophy, experience..."
                                placeholderTextColor="#666"
                                value={bio}
                                onChangeText={setBio}
                                multiline
                                numberOfLines={5}
                                textAlignVertical="top"
                            />
                        </View>
                    </>
                )}

                {/* Save Button */}
                <TouchableOpacity
                    style={[styles.saveBtn, saveBtnDisabled && styles.disabledBtn]}
                    onPress={handleSave}
                    disabled={saving}
                >
                    {saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
                </TouchableOpacity>

            </ScrollView>
        </View>
    );
}

const saveBtnDisabled = false;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },

    // Custom Header
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingHorizontal: 20 },
    backBtn: { marginRight: 15 },
    headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#fff' },

    content: { padding: 20, paddingBottom: 50 },

    section: { marginBottom: 30, backgroundColor: '#1e1e1e', padding: 20, borderRadius: 12 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 15 },

    avatarContainer: { alignItems: 'center', marginBottom: 20 },
    avatarWrapper: { position: 'relative', marginBottom: 10 },
    avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
    avatarImage: { width: 100, height: 100, borderRadius: 50 },
    avatarText: { fontSize: 40, fontWeight: 'bold', color: '#35c128' },
    editIconBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#2E7D32', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#1e1e1e' },
    editPhotoText: { color: '#35c128', fontSize: 14, fontWeight: '600' },

    label: { fontSize: 14, color: '#aaa', marginBottom: 8, marginTop: 5 },
    helperText: { fontSize: 12, color: '#666', marginBottom: 15 },
    input: { backgroundColor: '#252525', borderRadius: 8, padding: 12, color: '#fff', fontSize: 16, marginBottom: 15 },
    readOnly: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: 0.7 },

    chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#444', backgroundColor: '#252525' },
    selectedChip: { backgroundColor: 'rgba(53, 193, 40, 0.2)', borderColor: '#35c128' },
    chipText: { color: '#bbb', fontWeight: '500' },
    selectedChipText: { color: '#35c128', fontWeight: 'bold' },

    subHeader: { fontSize: 14, fontWeight: 'bold', color: '#ddd', marginBottom: 10 },
    emptyText: { color: '#666', fontStyle: 'italic', marginBottom: 10 },
    connectionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#252525', padding: 10, borderRadius: 8, marginBottom: 8 },
    connectionName: { color: '#fff', fontSize: 16, marginLeft: 10 },
    miniAvatar: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
    miniAvatarImage: { width: 30, height: 30, borderRadius: 15 },

    saveBtn: { backgroundColor: '#2E7D32', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
    disabledBtn: { opacity: 0.7 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

    // Teacher qualification styles
    dynamicRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    dynamicInput: { flex: 1, marginBottom: 0 },
    removeBtn: { marginLeft: 10 },
    addBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
    addBtnText: { color: '#2E7D32', fontWeight: '600', marginLeft: 6 },
    textArea: { minHeight: 120 }
});
