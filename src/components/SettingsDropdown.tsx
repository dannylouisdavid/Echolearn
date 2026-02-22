import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TouchableWithoutFeedback } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../services/auth/AuthContext';

import { CustomAlert } from './CustomAlert';

export default function SettingsDropdown() {
    const [visible, setVisible] = useState(false);
    const [alertVisible, setAlertVisible] = useState(false);
    const router = useRouter();
    const { logout } = useAuth();

    const handleNavigation = (path: string) => {
        setVisible(false);
        router.push(path as any);
    };

    const confirmLogout = async () => {
        setAlertVisible(false);
        await logout();
        router.replace('/login');
    };

    const handleLogout = () => {
        setVisible(false);
        setTimeout(() => {
            setAlertVisible(true);
        }, 300);
    };

    return (
        <View style={styles.container}>
            <TouchableOpacity onPress={() => setVisible(true)} style={styles.iconButton}>
                <MaterialCommunityIcons name="cog" size={24} color="#aaa" />
            </TouchableOpacity>

            <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
                <TouchableWithoutFeedback onPress={() => setVisible(false)}>
                    <View style={styles.modalOverlay}>
                        <View style={styles.dropdown}>
                            <Text style={styles.headerTitle}>Settings</Text>

                            <TouchableOpacity style={styles.item} onPress={() => handleNavigation('/settings/profile')}>
                                <MaterialCommunityIcons name="account" size={20} color="#fff" />
                                <Text style={styles.itemText}>Profile</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.item} onPress={() => handleNavigation('/settings/account')}>
                                <MaterialCommunityIcons name="lock" size={20} color="#fff" />
                                <Text style={styles.itemText}>Account</Text>
                            </TouchableOpacity>

                            <View style={styles.divider} />

                            <TouchableOpacity style={styles.item} onPress={() => handleNavigation('/settings/help')}>
                                <MaterialCommunityIcons name="help-circle" size={20} color="#fff" />
                                <Text style={styles.itemText}>Help & Support</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.item} onPress={() => handleNavigation('/settings/feedback')}>
                                <MaterialCommunityIcons name="message-text" size={20} color="#fff" />
                                <Text style={styles.itemText}>Feedback</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.item} onPress={() => handleNavigation('/settings/privacy')}>
                                <MaterialCommunityIcons name="shield-account" size={20} color="#fff" />
                                <Text style={styles.itemText}>Privacy Policy</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.item} onPress={() => handleNavigation('/settings/terms')}>
                                <MaterialCommunityIcons name="file-document" size={20} color="#fff" />
                                <Text style={styles.itemText}>Terms of Service</Text>
                            </TouchableOpacity>

                            <View style={styles.divider} />

                            <TouchableOpacity style={[styles.item, styles.logoutItem]} onPress={handleLogout}>
                                <MaterialCommunityIcons name="logout" size={20} color="#F44336" />
                                <Text style={[styles.itemText, styles.logoutText]}>Sign Out</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

            <CustomAlert
                visible={alertVisible}
                title="Log Out"
                message="Are you sure you want to log out?"
                onClose={() => setAlertVisible(false)}
                buttons={[
                    { text: "Cancel", onPress: () => setAlertVisible(false), style: 'cancel' },
                    { text: "Log Out", onPress: confirmLogout, style: 'destructive' }
                ]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { position: 'relative', zIndex: 100 },
    iconButton: { padding: 10 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: 60, paddingRight: 20 },
    dropdown: { width: 220, backgroundColor: '#252525', borderRadius: 12, padding: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 10 },
    headerTitle: { fontSize: 12, color: '#888', marginBottom: 10, marginLeft: 10, textTransform: 'uppercase', fontWeight: 'bold' },
    item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8 },
    itemText: { color: '#fff', fontSize: 16, marginLeft: 12 },
    divider: { height: 1, backgroundColor: '#333', marginVertical: 5 },
    logoutItem: { marginTop: 5 },
    logoutText: { color: '#F44336' }
});
