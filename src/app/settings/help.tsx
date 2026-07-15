import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Linking } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../services/auth/AuthContext';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface FAQ {
    question: string;
    answer: string;
    roles?: ('student' | 'teacher' | 'parent')[];
}

const FAQS: FAQ[] = [
    {
        question: "How do I connect with my teachers and parents/guardians?",
        answer: "Tap the green icon in the top right corner of your dashboard. Enter the email address of your teacher or parent/guardian to send them an invite. Once they accept the invite, they will be linked to your account and can view your learning progress.",
        roles: ['student']
    },
    {
        question: "How do I share my notebook and pages with my teachers and parents/guardians?",
        answer: "When creating or editing a notebook, you can set its visibility and select specific linked teachers or parents/guardians to share with. Only the users you select will be able to view your notebooks and track your progress.",
        roles: ['student']
    },
    {
        question: "How do I link with my students?",
        answer: "Tap the green icon in the top right corner of your dashboard. Enter the email address of the student to send them an invite. Once they accept the invite, they will be linked to your account and you can monitor their learning progress.",
        roles: ['teacher']
    },
    {
        question: "How do I create groups and assign notebooks?",
        answer: "Navigate to the 'Groups' tab to create a new group and add linked students. You can then assign specific notebooks to these groups, allowing all members to access the content and assignments automatically.",
        roles: ['teacher']
    },
    {
        question: "How does spaced repetition help me learn better?",
        answer: "Spaced repetition is a learning technique that shows you material at optimal intervals to maximize retention. Echolearn uses the SM-18 algorithm to schedule your reviews, helping you remember more with less study time.",
        roles: ['student']
    },
    {
        question: "How does spaced repetition help my child learn better?",
        answer: "Spaced repetition is a learning technique that shows material at optimal intervals to maximize retention. Echolearn uses the SM-18 algorithm to schedule reviews, helping them remember more with less study time.",
        roles: ['parent']
    },
    {
        question: "How does spaced repetition help my student learn better?",
        answer: "Spaced repetition is a learning technique that shows material at optimal intervals to maximize retention. Echolearn uses the SM-18 algorithm to schedule reviews, helping them remember more with less study time.",
        roles: ['teacher']
    },
    {
        question: "How do I view my child's learning progress?",
        answer: "Once your child sends you a connection request and you accept it, you can view their learning dashboard from your home screen. This shows their study time, topics covered, and retention rates.",
        roles: ['parent']
    }
];

export default function HelpSettings() {
    const { user, userProfile } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    // FAQ state
    const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);

    // Bug Report state
    const [showBugForm, setShowBugForm] = useState(false);
    const [bugSubject, setBugSubject] = useState('');
    const [bugDescription, setBugDescription] = useState('');
    const [bugSteps, setBugSteps] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Filter FAQs based on user role
    const filteredFAQs = FAQS.filter(faq => {
        if (!faq.roles) return true; // Show to all if no roles specified
        return faq.roles.includes(userProfile?.role as any);
    });

    const handleEmailSupport = () => {
        Linking.openURL('mailto:brainwarex.sup@gmail.com?subject=Support Request');
    };

    const handleSubmitBugReport = async () => {
        if (!bugSubject.trim()) {
            Alert.alert("Error", "Please enter a subject.");
            return;
        }
        if (!bugDescription.trim()) {
            Alert.alert("Error", "Please describe the issue.");
            return;
        }

        setSubmitting(true);
        try {
            await addDoc(collection(db, 'bug_reports'), {
                userId: user?.uid || 'anonymous',
                userEmail: user?.email || 'unknown',
                userRole: userProfile?.role || 'unknown',
                subject: bugSubject.trim(),
                description: bugDescription.trim(),
                stepsToReproduce: bugSteps.trim(),
                status: 'new',
                createdAt: serverTimestamp()
            });

            Alert.alert("Thank You!", "Your bug report has been submitted. We'll look into it as soon as possible.");
            setShowBugForm(false);
            setBugSubject('');
            setBugDescription('');
            setBugSteps('');
        } catch (error) {
            console.error("Error submitting bug report:", error);
            Alert.alert("Error", "Could not submit bug report. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top + 30 }]}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Help & Support</Text>
            </View>
            <ScrollView contentContainerStyle={styles.content}>

                {/* FAQs Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Frequently Asked Questions (FAQs)</Text>

                    {filteredFAQs.map((faq, index) => (
                        <TouchableOpacity
                            key={index}
                            style={styles.faqItem}
                            onPress={() => setExpandedFAQ(expandedFAQ === index ? null : index)}
                        >
                            <View style={styles.faqHeader}>
                                <Text style={styles.faqQuestion}>{faq.question}</Text>
                                <MaterialCommunityIcons
                                    name={expandedFAQ === index ? "chevron-up" : "chevron-down"}
                                    size={22}
                                    color="#888"
                                />
                            </View>
                            {expandedFAQ === index && (
                                <Text style={styles.faqAnswer}>{faq.answer}</Text>
                            )}
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Contact Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Contact Us</Text>

                    <TouchableOpacity style={styles.contactRow} onPress={handleEmailSupport}>
                        <View style={styles.contactLeft}>
                            <MaterialCommunityIcons name="email-outline" size={24} color="#4CAF50" />
                            <View>
                                <Text style={styles.contactTitle}>Email Support</Text>
                                <Text style={styles.contactSubtitle}>brainwarex.sup@gmail.com</Text>
                            </View>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={22} color="#666" />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.contactRow}
                        onPress={() => setShowBugForm(!showBugForm)}
                    >
                        <View style={styles.contactLeft}>
                            <MaterialCommunityIcons name="bug-outline" size={24} color="#FF9800" />
                            <View>
                                <Text style={styles.contactTitle}>Report a Bug</Text>
                                <Text style={styles.contactSubtitle}>Help us improve the app</Text>
                            </View>
                        </View>
                        <MaterialCommunityIcons
                            name={showBugForm ? "chevron-up" : "chevron-down"}
                            size={22}
                            color="#666"
                        />
                    </TouchableOpacity>

                    {/* Bug Report Form */}
                    {showBugForm && (
                        <View style={styles.bugForm}>
                            <Text style={styles.inputLabel}>Subject *</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Brief summary of the issue"
                                placeholderTextColor="#666"
                                value={bugSubject}
                                onChangeText={setBugSubject}
                            />

                            <Text style={styles.inputLabel}>Description *</Text>
                            <TextInput
                                style={[styles.input, styles.textArea]}
                                placeholder="Describe the issue in detail"
                                placeholderTextColor="#666"
                                value={bugDescription}
                                onChangeText={setBugDescription}
                                multiline
                                numberOfLines={4}
                                textAlignVertical="top"
                            />

                            <Text style={styles.inputLabel}>Steps to Reproduce (Optional)</Text>
                            <TextInput
                                style={[styles.input, styles.textArea]}
                                placeholder="1. Go to...&#10;2. Tap on...&#10;3. See error..."
                                placeholderTextColor="#666"
                                value={bugSteps}
                                onChangeText={setBugSteps}
                                multiline
                                numberOfLines={4}
                                textAlignVertical="top"
                            />

                            <TouchableOpacity
                                style={styles.submitBtn}
                                onPress={handleSubmitBugReport}
                                disabled={submitting}
                            >
                                {submitting ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <Text style={styles.submitBtnText}>Submit Bug Report</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },

    // Custom Header
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingHorizontal: 20 },
    backBtn: { marginRight: 15 },
    headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#fff' },

    content: { padding: 20, paddingBottom: 50 },

    section: { marginBottom: 25, backgroundColor: '#1e1e1e', padding: 16, borderRadius: 12 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 15 },

    // FAQ Styles
    faqItem: { borderBottomWidth: 1, borderBottomColor: '#2a2a2a', paddingVertical: 14 },
    faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    faqQuestion: { color: '#ddd', fontSize: 15, flex: 1, marginRight: 10, lineHeight: 22 },
    faqAnswer: { color: '#999', fontSize: 14, marginTop: 12, lineHeight: 22 },

    // Contact Styles
    contactRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
    contactLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    contactTitle: { color: '#ddd', fontSize: 15, fontWeight: '500' },
    contactSubtitle: { color: '#888', fontSize: 13, marginTop: 2 },

    // Bug Form Styles
    bugForm: { marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#2a2a2a' },
    inputLabel: { color: '#aaa', fontSize: 14, marginBottom: 8 },
    input: { backgroundColor: '#252525', borderRadius: 8, padding: 12, color: '#fff', fontSize: 16, marginBottom: 16 },
    textArea: { minHeight: 100 },

    submitBtn: { backgroundColor: '#2E7D32', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 5 },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' }
});
