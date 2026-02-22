import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../services/auth/AuthContext';
import { db } from '../../services/firebaseConfig';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { useEffect } from 'react';
import { sendInvite, unlinkUser } from '../../services/invites';

import { CustomAlert } from '../../components/CustomAlert';

export default function TeacherSearchScreen() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [linkedStudents, setLinkedStudents] = useState<any[]>([]);
    const { user, userProfile } = useAuth();
    const [successAlert, setSuccessAlert] = useState<{ visible: boolean, message: string, onOk?: () => void }>({ visible: false, message: '' });
    const router = useRouter();
    const insets = useSafeAreaInsets();

    useEffect(() => {
        fetchLinkedStudents();
    }, [user]);

    const fetchLinkedStudents = async () => {
        if (!user) return;

        try {
            // 1. Get latest user profile to ensure linkedStudents is fresh
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (!userDoc.exists()) return;

            const userData = userDoc.data();
            const studentIds = userData.linkedStudents || [];

            if (studentIds.length === 0) {
                setLinkedStudents([]);
                return;
            }

            // 2. Fetch student details
            // Firestore 'in' query supports up to 10 items.
            // For production, batches of 10 would be needed. 
            const q = query(collection(db, 'users'), where('uid', 'in', studentIds.slice(0, 10)));
            const snap = await getDocs(q);
            setLinkedStudents(snap.docs.map(d => d.data()));
        } catch (e) {
            console.log("Error fetching students", e);
        }
    };

    const handleUnlink = (student: any) => {
        Alert.alert(
            "Unlink Student",
            `Are you sure you want to remove ${student.displayName}?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await unlinkUser(user!.uid, student.uid);
                            // Optimistic update
                            setLinkedStudents(prev => prev.filter(s => s.uid !== student.uid));
                        } catch (e) {
                            Alert.alert("Error", "Could not unlink student.");
                        }
                    }
                }
            ]
        );
    };

    const handleInvite = async () => {
        if (!email.trim()) {
            Alert.alert("Error", "Please enter an email address.");
            return;
        }

        setLoading(true);
        try {
            if (!user) throw new Error("Not authenticated");
            await sendInvite(user as any, email.trim().toLowerCase(), 'teacher_to_student');
            setSuccessAlert({
                visible: true,
                message: `Invite sent to ${email}!`,
                onOk: () => setEmail('')
            });
        } catch (e: any) {
            Alert.alert("Error", e.message || "Failed to send invite.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 30 }]}>
                <TouchableOpacity onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={28} color="white" />
                </TouchableOpacity>
                <Text style={styles.title}>Student Management</Text>
            </View>

            <View style={styles.content}>
                {/* Linked Students List */}
                {linkedStudents.length > 0 && (
                    <View style={{ marginBottom: 30 }}>
                        <Text style={styles.sectionTitle}>My Students</Text>
                        {linkedStudents.map(student => (
                            <View key={student.uid} style={styles.studentCard}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.studentName}>{student.displayName}</Text>
                                    <Text style={styles.studentEmail}>{student.email}</Text>
                                </View>
                                <TouchableOpacity onPress={() => handleUnlink(student)} style={styles.unlinkBtn}>
                                    <Text style={styles.unlinkText}>Unlink</Text>
                                    <MaterialCommunityIcons name="link-variant-off" size={16} color="#F44336" style={{ marginLeft: 4 }} />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                )}

                <Text style={styles.sectionTitle}>Add New Student</Text>
                <Text style={styles.label}>Enter Student Email</Text>
                <TextInput
                    style={styles.input}
                    placeholder="student@example.com"
                    placeholderTextColor="#666"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />

                <TouchableOpacity
                    style={[styles.btn, loading && styles.btnDisabled]}
                    onPress={handleInvite}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.btnText}>Send Invite</Text>
                    )}
                </TouchableOpacity>

                <View style={styles.infoBox}>
                    <MaterialCommunityIcons name="information" size={20} color="#aaa" />
                    <Text style={styles.infoText}>
                        The student must have an existing Echolearn account with this email address.
                    </Text>
                </View>
            </View>

            <CustomAlert
                visible={successAlert.visible}
                title="Success"
                message={successAlert.message}
                onClose={() => {
                    setSuccessAlert(prev => ({ ...prev, visible: false }));
                    if (successAlert.onOk) successAlert.onOk();
                }}
                buttons={[
                    {
                        text: "OK",
                        onPress: () => {
                            setSuccessAlert(prev => ({ ...prev, visible: false }));
                            if (successAlert.onOk) successAlert.onOk();
                        }
                    }
                ]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
    title: { fontSize: 28, fontWeight: 'bold', color: 'white', marginLeft: 15 },

    content: { padding: 20 },
    label: { color: 'white', marginBottom: 10, fontSize: 16 },
    input: { backgroundColor: '#1e1e1e', color: 'white', padding: 15, borderRadius: 8, fontSize: 16, borderWidth: 1, borderColor: '#333', marginBottom: 20 },

    btn: { backgroundColor: '#35c128', padding: 15, borderRadius: 8, alignItems: 'center' },
    btnDisabled: { opacity: 0.7 },
    btnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },

    infoBox: { flexDirection: 'row', marginTop: 20, padding: 15, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, alignItems: 'center' },
    infoText: { color: '#aaa', marginLeft: 10, flex: 1, lineHeight: 20 },

    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: 'white', marginBottom: 15 },
    studentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 15, borderRadius: 10, marginBottom: 10 },
    studentName: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    studentEmail: { color: '#aaa', fontSize: 12 },
    unlinkBtn: { flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: 'rgba(244, 67, 54, 0.1)', borderRadius: 20 },
    unlinkText: { color: '#F44336', fontSize: 12, fontWeight: 'bold' }
});
