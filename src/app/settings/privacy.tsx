import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../services/auth/AuthContext';

export default function PrivacyPolicy() {
    const { userProfile } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const role = userProfile?.role || 'student'; // Default to student if unknown

    const renderRoleSpecificContent = () => {
        if (role === 'teacher') {
            return (
                <>
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>2. Information We Collect (Teachers)</Text>
                        <Text style={styles.paragraph}>
                            <Text style={styles.bold}>Professional Details:</Text> We collect your qualifications, certifications, and bio to display on your teacher profile.{'\n'}
                            <Text style={styles.bold}>Class Data:</Text> Information about groups you create and notebooks you assign.{'\n'}
                            <Text style={styles.bold}>Student Interaction:</Text> Data regarding your connections with students and their progress tracking.
                        </Text>
                    </View>
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>3. How We Use Your Information (Teachers)</Text>
                        <Text style={styles.paragraph}>
                            • To showcase your professional profile to potential students.{'\n'}
                            • To facilitate group management and assignment distribution.{'\n'}
                            • To provide analytics on your students' performance.{'\n'}
                            • To connect you with students seeking guidance.
                        </Text>
                    </View>
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>4. Data Sharing (Teachers)</Text>
                        <Text style={styles.paragraph}>
                            <Text style={styles.bold}>With Students:</Text> Your professional profile and assigned content are visible to linked students.{'\n'}
                            <Text style={styles.bold}>With Parents:</Text> Linked parents can view your profile as their child's instructor.
                        </Text>
                    </View>
                </>
            );
        } else if (role === 'parent') {
            return (
                <>
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>2. Information We Collect (Parents/Guardians)</Text>
                        <Text style={styles.paragraph}>
                            <Text style={styles.bold}>Account Details:</Text> Your name and contact information.{'\n'}
                            <Text style={styles.bold}>Child Linkage:</Text> Data connecting you to your child's student account.{'\n'}
                            <Text style={styles.bold}>Monitoring Data:</Text> Logs of your access to your child's progress reports.
                        </Text>
                    </View>
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>3. How We Use Your Information (Parents/Guardians)</Text>
                        <Text style={styles.paragraph}>
                            • To verify your identity as a guardian.{'\n'}
                            • To provide you with secure access to your child's learning dashboard.{'\n'}
                            • To facilitate communication with your child's teachers.
                        </Text>
                    </View>
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>4. Data Sharing (Parents/Guardians)</Text>
                        <Text style={styles.paragraph}>
                            <Text style={styles.bold}>With Teachers:</Text> Your contact information may be visible to your child's linked teachers for communication purposes.{'\n'}
                            <Text style={styles.bold}>With Students:</Text> Your child sees that their account is linked to yours.
                        </Text>
                    </View>
                </>
            );
        } else {
            // Student (Default)
            return (
                <>
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>2. Information We Collect (Students)</Text>
                        <Text style={styles.paragraph}>
                            <Text style={styles.bold}>Learning Data:</Text> We track your study time, topics covered, quiz scores, and retention metrics.{'\n'}
                            <Text style={styles.bold}>Content Creation:</Text> Notes, drawings, and other content you create in your notebooks.{'\n'}
                            <Text style={styles.bold}>Profile Info:</Text> Your display name, photo, and academic goals.
                        </Text>
                    </View>
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>3. How We Use Your Information (Students)</Text>
                        <Text style={styles.paragraph}>
                            • To calculate your optimal review schedule using the SM-18 algorithm.{'\n'}
                            • To generate personalized quizzes and learning recommendations.{'\n'}
                            • To visualize your progress for you, your teachers, and your parents.
                        </Text>
                    </View>
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>4. Data Sharing (Students)</Text>
                        <Text style={styles.paragraph}>
                            <Text style={styles.bold}>With Teachers:</Text> Linked teachers can view your notebooks (if shared), assignments, and detailed progress analytics.{'\n'}
                            <Text style={styles.bold}>With Parents:</Text> Linked parents can view your study stats and shared content.{'\n'}
                            <Text style={styles.bold}>Privacy Control:</Text> You control which notebooks are shared with teachers or parents.
                        </Text>
                    </View>
                </>
            );
        }
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top + 30 }]}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Privacy Policy</Text>
            </View>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.lastUpdated}>Last Updated: December 30, 2025</Text>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>1. Introduction</Text>
                    <Text style={styles.paragraph}>
                        Welcome to Echolearn. Your privacy is important to us. This policy outlines how we handle your data specifically for your role as a <Text style={styles.bold}>{role === 'parent' ? 'Parent/Guardian' : role.charAt(0).toUpperCase() + role.slice(1)}</Text>.
                    </Text>
                </View>

                {renderRoleSpecificContent()}

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>5. Data Management & Deletion</Text>
                    <Text style={styles.paragraph}>
                        You have full control over your data. We provide comprehensive options for managing, exporting, and deleting your content:
                    </Text>

                    <Text style={[styles.subHeading, { color: '#FF9800' }]}>Wipe Data (Fresh Start)</Text>
                    <Text style={styles.paragraph}>
                        The "Wipe Data" feature in your Account Settings allows you to permanently delete all your generated content (notebooks, pages, study materials) without deleting your account. This is useful if you wish to start a new academic year or change your focus exam. This action requires password confirmation and cannot be undone.
                    </Text>


                    <Text style={[styles.subHeading, { color: '#4CAF50' }]}>Download My Data</Text>
                    <Text style={styles.paragraph}>
                        We believe you should have easy access to your own information. You can use the "Download My Data" feature in Account Settings at any time to export a comprehensive JSON file containing your user profile, notebooks, pages, and study progress. This file can be saved to your device for your own records or to transfer your data.
                    </Text>

                    <Text style={[styles.subHeading, { color: '#e74c3c' }]}>Delete Account</Text>
                    <Text style={styles.paragraph}>
                        The "Delete Account" feature permanently removes your entire account, including your profile, login credentials, and all associated data. We perform a client-side cleanup to ensure your notebooks and pages are removed before your account is deleted. This action is irreversible.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>6. Data Security</Text>
                    <Text style={styles.paragraph}>
                        We implement industry-standard encryption and security measures to protect your data. Your password protects your account, so please keep it unique and secure.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>7. Your Rights</Text>
                    <Text style={styles.paragraph}>
                        You have the right to access, update, or delete your personal information at any time via the app settings.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>8. Contact Us</Text>
                    <Text style={styles.paragraph}>
                        If you have questions about this policy, please contact us at <Text style={styles.link}>brainwarex.sup@gmail.com</Text>.
                    </Text>
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
    lastUpdated: { color: '#666', fontSize: 14, marginBottom: 20, fontStyle: 'italic' },
    section: { marginBottom: 25 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 10 },
    subHeading: { fontSize: 16, fontWeight: 'bold', marginTop: 15, marginBottom: 5 },
    paragraph: { fontSize: 15, color: '#ccc', lineHeight: 24 },
    bold: { fontWeight: 'bold', color: '#fff' },
    link: { color: '#4CAF50', textDecorationLine: 'underline' }
});
