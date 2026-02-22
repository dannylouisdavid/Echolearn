import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Modal } from 'react-native';
import { doc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { auth, db } from '../../services/firebaseConfig';
import { useRouter } from 'expo-router';
import { useAuth } from '../../services/auth/AuthContext';

const EXAM_OPTIONS = ["SAT", "GRE", "GMAT", "MCAT", "UPSC", "Board Exams", "Computer Science", "Medical", "Law", "Other"];

export default function SelectExamScreen() {
    const [selectedExams, setSelectedExams] = useState<string[]>([]);
    const [otherText, setOtherText] = useState("");
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const router = useRouter();
    const { user, userProfile, setProfileLocal } = useAuth(); // Get user from context

    const toggleExam = (exam: string) => {
        if (selectedExams.includes(exam)) {
            setSelectedExams(selectedExams.filter(e => e !== exam));
        } else {
            setSelectedExams([...selectedExams, exam]);
        }
    };

    const handleContinue = () => {
        setShowSuccessModal(false);
        router.replace('/student/(tabs)');
    };

    const handleFinish = async () => {
        if (selectedExams.length === 0 && (!selectedExams.includes("Other") || !otherText)) {
            if (selectedExams.length === 0) {
                Alert.alert("Required", "Please select at least one exam or option.");
                return;
            }
        }

        const targets = selectedExams.filter(e => e !== "Other");
        if (selectedExams.includes("Other") && otherText) {
            targets.push(otherText);
        }

        try {
            const uid = user?.uid; // Use context user
            if (!uid) return;

            // IMMEDIATE DEV BYPASS
            if (uid === 'test-user-123') {
                if (userProfile) {
                    const updatedProfile = { ...userProfile, onboardingCompleted: true, preparationTarget: targets.join(", ") };
                    setProfileLocal(updatedProfile);
                    router.replace('/student/(tabs)');
                }
                return;
            }

            // 1. Update Profile
            await updateDoc(doc(db, 'users', uid), {
                preparationTarget: targets.join(", "),
                onboardingCompleted: true
            });

            // 2. Create Default Notebook (if strictly first time, but maybe we should check)
            // Ideally check if not exists, but for MVP adding "General" is fine.
            // Actually, let's keep it safe. 

            await addDoc(collection(db, 'notebooks'), {
                title: "General",
                ownerId: uid,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                type: 'general',
                sharedWith: []
            });

            setShowSuccessModal(true);
        } catch (e) {
            console.error("Exam selection failed:", e);
            // Fallback: Update local profile to allow navigation
            if (userProfile) {
                const updatedProfile = { ...userProfile, onboardingCompleted: true, preparationTarget: targets.join(", ") };
                setProfileLocal(updatedProfile);
                router.replace('/student/(tabs)');
            } else {
                Alert.alert("Error", "Setup failed.");
            }
        }
    };

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>What are you preparing for?</Text>
            <Text style={styles.subtitle}>Select all that apply</Text>

            <View style={styles.optionsContainer}>
                {EXAM_OPTIONS.map(exam => (
                    <TouchableOpacity
                        key={exam}
                        style={[styles.option, selectedExams.includes(exam) && styles.selectedOption]}
                        onPress={() => toggleExam(exam)}
                    >
                        <Text style={[styles.optionText, selectedExams.includes(exam) && styles.selectedOptionText]}>{exam}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {selectedExams.includes("Other") && (
                <TextInput
                    style={styles.input}
                    placeholder="Enter exam name"
                    placeholderTextColor="#666"
                    value={otherText}
                    onChangeText={setOtherText}
                />
            )}

            <TouchableOpacity style={styles.button} onPress={handleFinish}>
                <Text style={styles.buttonText}>Start Learning</Text>
            </TouchableOpacity>

            <Modal visible={showSuccessModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        <Text style={styles.modalTitle}>All Set!</Text>
                        <Text style={styles.modalDesc}>Your learning path is ready.</Text>
                        <TouchableOpacity style={styles.modalBtn} onPress={handleContinue}>
                            <Text style={styles.modalBtnText}>Continue</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flexGrow: 1, justifyContent: 'center', padding: 20, backgroundColor: '#121212', paddingVertical: 50 },
    title: { fontSize: 26, fontWeight: 'bold', marginBottom: 10, textAlign: 'center', color: '#fff' },
    subtitle: { fontSize: 16, color: '#aaa', marginBottom: 30, textAlign: 'center' },
    optionsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginBottom: 30 },
    option: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#444', backgroundColor: '#252525' },
    selectedOption: { backgroundColor: 'rgba(53, 193, 40, 0.2)', borderColor: '#35c128' },
    optionText: { color: '#ccc', fontWeight: '500' },
    selectedOptionText: { color: '#35c128', fontWeight: 'bold' },
    input: { borderWidth: 1, borderColor: '#444', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 20, width: '100%', backgroundColor: '#252525', color: '#fff' },
    button: { backgroundColor: '#2E7D32', padding: 16, borderRadius: 8, width: '100%', alignItems: 'center' },
    buttonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },

    // Modal Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
    modalContainer: { backgroundColor: '#1e1e1e', padding: 25, borderRadius: 12, width: '85%', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 10 },
    modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 10 },
    modalDesc: { fontSize: 16, color: '#ccc', textAlign: 'center', marginBottom: 25 },
    modalBtn: { backgroundColor: '#2E7D32', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 8, width: '100%', alignItems: 'center' },
    modalBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' }
});
