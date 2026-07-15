import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function TermsOfService() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { paddingTop: insets.top + 30 }]}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Terms of Service</Text>
            </View>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.lastUpdated}>Last Updated: December 30, 2025</Text>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
                    <Text style={styles.paragraph}>
                        By identifying as a user of Echolearn, accessing or using our application, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>2. User Accounts</Text>
                    <Text style={styles.paragraph}>
                        You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to provide accurate and complete information when creating your account.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>3. User Conduct</Text>
                    <Text style={styles.paragraph}>
                        You agree not to misuse our services. This includes not engaging in any activity that interferes with or disrupts the app, or using the app for any illegal or unauthorized purpose.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>4. Intellectual Property</Text>
                    <Text style={styles.paragraph}>
                        All content, features, and functionality of Echolearn, including our spaced repetition algorithms and design, are the exclusive property of Echolearn and are protected by international copyright/intellectual property laws.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>5. Billing and Subscription Cycles</Text>
                    <Text style={styles.paragraph}>
                        Our subscription billing cycle is designed to maximize value for our users.
                        {'\n\n'}
                        <Text style={{ fontWeight: 'bold', color: '#fff' }}>If you subscribe during an active Free Trial:</Text> Your paid subscription period will commence immediately AFTER your free trial ends. You will not lose any remaining trial days.
                        {'\n\n'}
                        <Text style={{ fontWeight: 'bold', color: '#fff' }}>If you subscribe without an active Free Trial:</Text> You will receive a fresh 7-day free trial starting immediately. Your paid subscription billing cycle will commence only after this 7-day trial period concludes.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>6. Account Termination and Refund Policy</Text>
                    <Text style={styles.paragraph}>
                        You are free to terminate your account at any time. However, it is crucial to understand the consequences of this action:
                        {'\n\n'}
                        <Text style={{ fontWeight: 'bold', color: '#fff' }}>Permanent Data Loss:</Text> Deleting your account is irreversible. All your personal data, learning progress, notebooks, and settings will be permanently erased. We <Text style={{ fontWeight: 'bold', color: '#fff' }}>cannot</Text> recover this data once your account is deleted.
                        {'\n\n'}
                        <Text style={{ fontWeight: 'bold', color: '#fff' }}>No Refunds:</Text> We strictly do <Text style={{ fontWeight: 'bold', color: '#fff' }}>not</Text> issue refunds for voluntary account deletions. If you choose to delete your account while holding an active subscription or past purchase, you agree to forfeit any remaining subscription period or value. No refunds will be provided using account deletion as a basis under any circumstances.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>7. Disclaimer of Warranties</Text>
                    <Text style={styles.paragraph}>
                        The service is provided on an "AS IS" and "AS AVAILABLE" basis. We make no warranties, expressed or implied, regarding the reliability, accuracy, or availability of the service.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>8. Limitation of Liability</Text>
                    <Text style={styles.paragraph}>
                        In no event shall Echolearn be liable for any indirect, incidental, special, consequential or punitive damages arising out of or related to your use of the service.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>9. Changes to Terms</Text>
                    <Text style={styles.paragraph}>
                        We reserve the right to modify these terms at any time. We will notify you of any changes by posting the new Terms of Service on this page.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>10. Contact</Text>
                    <Text style={styles.paragraph}>
                        For any questions regarding these terms, please contact us at <Text style={styles.link}>brainwarex.sup@gmail.com</Text>.
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
    paragraph: { fontSize: 15, color: '#ccc', lineHeight: 24 },
    link: { color: '#4CAF50', textDecorationLine: 'underline' }
});
