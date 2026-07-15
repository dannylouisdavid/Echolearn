import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal, Share, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../../services/auth/AuthContext';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider, deleteUser } from 'firebase/auth';
import { doc, deleteDoc, collection, query, where, getDocs, writeBatch, updateDoc } from 'firebase/firestore';
import * as Clipboard from 'expo-clipboard';
import { auth, db } from '../../services/firebaseConfig';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { CustomAlert } from '../../components/CustomAlert';

export default function AccountSettings() {
    const { user, logout, userProfile } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    // Check linked providers
    const hasPasswordProvider = useMemo(() => {
        return user?.providerData?.some(p => p.providerId === 'password') || false;
    }, [user]);

    const hasGoogleProvider = useMemo(() => {
        return user?.providerData?.some(p => p.providerId === 'google.com') || false;
    }, [user]);

    // Change Password state
    const [showPasswordSection, setShowPasswordSection] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [changingPassword, setChangingPassword] = useState(false);

    // Delete Account state
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [deleteStatus, setDeleteStatus] = useState('');
    const [showDeletedModal, setShowDeletedModal] = useState(false);

    const handleDeletedConfirm = () => {
        setShowDeletedModal(false);
        router.replace('/login');
    };

    const handleChangePassword = async () => {
        if (!user || !user.email) return;

        if (newPassword.length < 6) {
            Alert.alert("Error", "New password must be at least 6 characters.");
            return;
        }
        if (newPassword !== confirmPassword) {
            Alert.alert("Error", "New passwords do not match.");
            return;
        }

        setChangingPassword(true);
        try {
            // Re-authenticate user first
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);

            // Update password
            await updatePassword(user, newPassword);

            Alert.alert("Success", "Password changed successfully!");
            setShowPasswordSection(false);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            console.error("Password change error:", error);
            if (error.code === 'auth/wrong-password') {
                Alert.alert("Error", "Current password is incorrect.");
            } else if (error.code === 'auth/requires-recent-login') {
                Alert.alert("Error", "Please log out and log in again before changing your password.");
            } else {
                Alert.alert("Error", "Could not change password. Please try again.");
            }
        } finally {
            setChangingPassword(false);
        }
    };

    // Custom Alert State
    const [customAlert, setCustomAlert] = useState({
        visible: false,
        title: '',
        message: '',
        buttons: [] as any[]
    });

    const handleDownloadData = async () => {
        if (!user) return;

        try {
            // Show Preparing
            setCustomAlert({
                visible: true,
                title: "Preparing Data",
                message: "This may take a moment...",
                buttons: []
            });

            // 1. Fetch User Data
            const userDoc = await getDocs(query(collection(db, 'users'), where('uid', '==', user.uid)));
            const userData = userDoc.empty ? {} : userDoc.docs[0].data();

            // 2. Fetch Notebooks
            const notebooksSnap = await getDocs(query(collection(db, 'notebooks'), where('ownerId', '==', user.uid)));
            const notebooks = notebooksSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            // 3. Fetch Pages
            const pagesSnap = await getDocs(query(collection(db, 'pages'), where('ownerId', '==', user.uid)));
            const pages = pagesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const exportData = {
                user: userData,
                notebooks,
                pages,
                exportDate: new Date().toISOString(),
                version: '1.0'
            };

            const jsonString = JSON.stringify(exportData, null, 2);

            // Show Ready Alert
            const dataSize = jsonString.length;
            const sizeMB = (dataSize / (1024 * 1024)).toFixed(2);

            setCustomAlert({
                visible: true,
                title: "Data Ready",
                message: `Found ${notebooks.length} notebooks and ${pages.length} pages.\nSize: ${sizeMB} MB`,
                buttons: [
                    {
                        text: "Copy to Clipboard",
                        onPress: async () => {
                            if (dataSize > 1000000) { // > ~1MB
                                Alert.alert("Warning", "Data is large (>1MB). Clipboard may fail. Use 'Share File' instead.");
                            }
                            await Clipboard.setStringAsync(jsonString);
                            setCustomAlert(prev => ({ ...prev, visible: false }));

                            setTimeout(() => {
                                setCustomAlert({
                                    visible: true,
                                    title: "Copied",
                                    message: "Data copied to clipboard.",
                                    buttons: [{ text: "OK", onPress: () => setCustomAlert(prev => ({ ...prev, visible: false })) }]
                                });
                            }, 300);
                        }
                    },
                    {
                        text: "Share File",
                        autoClose: false,
                        onPress: async () => {
                            try {
                                const fileName = `Echolearn_Data_${new Date().toISOString().split('T')[0]}.json`;
                                const fileUri = FileSystem.cacheDirectory + fileName;

                                await FileSystem.writeAsStringAsync(fileUri, jsonString, { encoding: FileSystem.EncodingType.UTF8 });

                                if (await Sharing.isAvailableAsync()) {
                                    await Sharing.shareAsync(fileUri);
                                } else {
                                    Alert.alert("Error", "Sharing is not available on this device");
                                }
                            } catch (e) {
                                console.log(e);
                                Alert.alert("Error", "Could not save file.");
                            }
                        }
                    },
                    ...(Platform.OS === 'android' ? [{
                        text: "Save to Device",
                        autoClose: false,
                        onPress: async () => {
                            try {
                                const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
                                if (permissions.granted) {
                                    const fileName = `Echolearn_Data_${new Date().toISOString().split('T')[0]}.json`;
                                    const mimeType = 'application/json';

                                    const uri = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, fileName, mimeType);
                                    await FileSystem.writeAsStringAsync(uri, jsonString, { encoding: FileSystem.EncodingType.UTF8 });

                                    // Close the "Data Ready" alert first (already done by previous setCustomAlert call if it was there, but ensure it's updated)
                                    setCustomAlert({
                                        visible: true,
                                        title: "Success",
                                        message: "File saved successfully to selected folder.",
                                        buttons: [{ text: "OK", onPress: () => setCustomAlert(prev => ({ ...prev, visible: false })) }]
                                    });
                                }
                            } catch (e) {
                                console.log(e);
                                Alert.alert("Error", "Could not save to downloads.");
                            }
                        }
                    }] : []),
                    {
                        text: "Cancel",
                        style: "cancel",
                        onPress: () => setCustomAlert(prev => ({ ...prev, visible: false }))
                    }
                ]
            });

        } catch (e) {
            console.error(e);
            setCustomAlert({
                visible: true,
                title: "Error",
                message: "Failed to compile data.",
                buttons: [{ text: "OK", onPress: () => setCustomAlert(prev => ({ ...prev, visible: false })) }]
            });
        }
    };

    const [showWipeConfirm, setShowWipeConfirm] = useState(false);
    const [wipePassword, setWipePassword] = useState('');
    const [wiping, setWiping] = useState(false);

    const handleWipeData = async () => {
        if (!user) return;

        // For password users, require password confirmation
        if (hasPasswordProvider && !wipePassword) {
            Alert.alert("Error", "Please enter your password to confirm.");
            return;
        }

        Alert.alert(
            "Wipe All Data",
            "Are you sure? This will delete all yourPRIVATE content. Shared content will be preserved for students.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Wipe Data",
                    style: "destructive",
                    onPress: async () => {
                        setWiping(true);
                        setDeleteStatus("Verifying credentials...");
                        try {
                            if (hasPasswordProvider && user.email) {
                                const credential = EmailAuthProvider.credential(user.email, wipePassword);
                                await reauthenticateWithCredential(user, credential);
                            }

                            setDeleteStatus("Analyzing your data...");
                            const isTeacher = userProfile?.role === 'teacher';
                            const orphanedNotebookIds = new Set();

                            // 1. Process Notebooks
                            const notebooksSnap = await getDocs(query(collection(db, 'notebooks'), where('ownerId', '==', user.uid)));

                            if (!notebooksSnap.empty) {
                                setDeleteStatus(`Processing ${notebooksSnap.size} notebooks...`);
                                for (const nb of notebooksSnap.docs) {
                                    const data = nb.data();
                                    const isShared = (data.sharedWith && data.sharedWith.length > 0) || (data.sharedWithParents && data.sharedWithParents.length > 0);

                                    if (isTeacher && isShared) {
                                        // ORPHAN: Update ownerId so teacher loses it, but students keep it
                                        orphanedNotebookIds.add(nb.id);
                                        await updateDoc(doc(db, 'notebooks', nb.id), { ownerId: 'orphaned' });
                                    } else {
                                        // DELETE: Private or Student owned
                                        await deleteDoc(doc(db, 'notebooks', nb.id));
                                    }
                                }
                            }

                            // 2. Process Pages
                            const pagesSnap = await getDocs(query(collection(db, 'pages'), where('ownerId', '==', user.uid)));

                            if (!pagesSnap.empty) {
                                setDeleteStatus(`Processing ${pagesSnap.size} pages...`);
                                for (const page of pagesSnap.docs) {
                                    const data = page.data();
                                    if (orphanedNotebookIds.has(data.notebookId)) {
                                        // Preserve page if notebook was preserved
                                        await updateDoc(doc(db, 'pages', page.id), { ownerId: 'orphaned' });
                                    } else {
                                        await deleteDoc(doc(db, 'pages', page.id));
                                    }
                                }
                            }

                            setDeleteStatus("Done!");
                            Alert.alert("Success", "Your data has been wiped. You have a fresh start.");
                            setShowWipeConfirm(false);
                            setWipePassword("");
                        } catch (error: any) {
                            console.error("Wipe error:", error);
                            if (error.code === 'auth/wrong-password') {
                                Alert.alert("Error", "Password is incorrect.");
                            } else {
                                Alert.alert("Error", "Could not wipe data. Please try again.");
                            }
                        } finally {
                            setWiping(false);
                            setDeleteStatus("");
                        }
                    }
                }
            ]
        );
    };

    const handleDeleteAccount = async () => {
        if (!user) return;

        // For password users, require password confirmation
        if (hasPasswordProvider && !deletePassword) {
            Alert.alert("Error", "Please enter your password to confirm deletion.");
            return;
        }

        Alert.alert(
            "Delete Account",
            "Are you absolutely sure? This will permanently delete your account.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete Forever",
                    style: "destructive",
                    onPress: async () => {
                        setDeleting(true);
                        setDeleteStatus("Verifying credentials...");
                        try {
                            // Re-authenticate if password user
                            if (hasPasswordProvider && user.email) {
                                const credential = EmailAuthProvider.credential(user.email, deletePassword);
                                await reauthenticateWithCredential(user, credential);
                            }

                            // --- CLIENT SIDE CLEANUP ---
                            setDeleteStatus("Analyzing your data...");
                            const isTeacher = userProfile?.role === 'teacher';
                            const orphanedNotebookIds = new Set();

                            // 1. Process Notebooks
                            const notebooksSnap = await getDocs(query(collection(db, 'notebooks'), where('ownerId', '==', user.uid)));

                            if (!notebooksSnap.empty) {
                                setDeleteStatus(`Processing ${notebooksSnap.size} notebooks...`);
                                for (const nb of notebooksSnap.docs) {
                                    const data = nb.data();
                                    const isShared = (data.sharedWith && data.sharedWith.length > 0) || (data.sharedWithParents && data.sharedWithParents.length > 0);

                                    if (isTeacher && isShared) {
                                        // ORPHAN: Preserved for students
                                        orphanedNotebookIds.add(nb.id);
                                        await updateDoc(doc(db, 'notebooks', nb.id), { ownerId: 'orphaned' });
                                    } else {
                                        // DELETE
                                        await deleteDoc(doc(db, 'notebooks', nb.id));
                                    }
                                }
                            }

                            // 2. Process Pages (Wait until after decision is made)
                            const pagesSnap = await getDocs(query(collection(db, 'pages'), where('ownerId', '==', user.uid)));

                            if (!pagesSnap.empty) {
                                setDeleteStatus(`Processing ${pagesSnap.size} pages...`);
                                for (const page of pagesSnap.docs) {
                                    const data = page.data();
                                    if (orphanedNotebookIds.has(data.notebookId)) {
                                        await updateDoc(doc(db, 'pages', page.id), { ownerId: 'orphaned' });
                                    } else {
                                        await deleteDoc(doc(db, 'pages', page.id));
                                    }
                                }
                            }

                            // 3. Delete User Profile
                            setDeleteStatus("Deleting user profile...");
                            await deleteDoc(doc(db, 'users', user.uid));

                            // 4. Delete Auth
                            setDeleteStatus("Finalizing...");
                            await deleteUser(user);

                            setShowDeletedModal(true);
                        } catch (error: any) {
                            console.error("Delete account error:", error);
                            if (error.code === 'auth/wrong-password') {
                                Alert.alert("Error", "Password is incorrect.");
                            } else if (error.code === 'auth/requires-recent-login') {
                                Alert.alert("Error", "Please log out and log in again before deleting your account.");
                            } else {
                                Alert.alert("Error", "Could not delete account. Please try again.");
                            }
                        } finally {
                            setDeleting(false);
                        }
                    }
                }
            ]
        );
    };

    const handleLogout = async () => {
        setCustomAlert({
            visible: true,
            title: "Log Out",
            message: "Are you sure you want to log out?",
            buttons: [
                {
                    text: "Cancel",
                    style: "cancel",
                    onPress: () => setCustomAlert(prev => ({ ...prev, visible: false }))
                },
                {
                    text: "Log Out",
                    style: "destructive", // Note: Helper might not support 'destructive' style class mapping if not implemented in CustomAlert, but checking CustomAlert.tsx, it supports btn.style === 'cancel'. It doesn't seem to explicitly handle 'destructive' color unless I add it to CustomAlert style logic? 
                    // ... Checking CustomAlert.tsx previously viewed ...
                    // It has: style={[styles.button, btn.style === 'cancel' && styles.cancelButton]}
                    // It does NOT have specific red styling for 'destructive'.
                    // I should probably update CustomAlert.tsx to handle 'destructive' or just accept it's green for now.
                    // Wait, the user asked for "consistent with the other dark theme message boxes".
                    // If I used 'destructive' in SettingsDropdown, I should verify CustomAlert handles it.
                    // Let's modify CustomAlert.tsx FIRST/LATER or just pass a style?
                    // CustomAlert buttons prop is { text, onPress, style, autoClose }. 
                    // The component only checks `style === 'cancel'`.
                    // So 'destructive' will render as a default green button.
                    // I will stick to 'destructive' string here and update CustomAlert in next step if needed, OR just let it be green for now. 
                    // Actually, for "Leafy" theme, maybe logout is green? 
                    // But in SettingsDropdown I used 'destructive' too.
                    // Let's just implement the logic first.
                    onPress: async () => {
                        await logout();
                        router.replace('/login');
                    }
                }
            ]
        });
    };

    const appVersion = Constants.expoConfig?.version || '1.0.0';

    return (
        <View style={[styles.container, { paddingTop: insets.top + 30 }]}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Account</Text>
            </View>
            <ScrollView contentContainerStyle={styles.content}>

                {/* Linked Accounts Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Linked Accounts</Text>

                    <View style={styles.row}>
                        <View style={styles.rowLeft}>
                            <MaterialCommunityIcons name="email" size={22} color="#aaa" />
                            <Text style={styles.rowText}>Email/Password</Text>
                        </View>
                        {hasPasswordProvider ? (
                            <MaterialCommunityIcons name="check-circle" size={22} color="#4CAF50" />
                        ) : (
                            <Text style={styles.notLinked}>Not linked</Text>
                        )}
                    </View>

                    <View style={styles.row}>
                        <View style={styles.rowLeft}>
                            <MaterialCommunityIcons name="google" size={22} color="#aaa" />
                            <Text style={styles.rowText}>Google</Text>
                        </View>
                        {hasGoogleProvider ? (
                            <MaterialCommunityIcons name="check-circle" size={22} color="#4CAF50" />
                        ) : (
                            <Text style={styles.notLinked}>Not linked</Text>
                        )}
                    </View>
                </View>

                {/* Change Password Section (Only for password users) */}
                {hasPasswordProvider && (
                    <View style={styles.section}>
                        <TouchableOpacity
                            style={styles.sectionHeader}
                            onPress={() => setShowPasswordSection(!showPasswordSection)}
                        >
                            <Text style={styles.sectionTitle}>Change Password</Text>
                            <MaterialCommunityIcons
                                name={showPasswordSection ? "chevron-up" : "chevron-down"}
                                size={24}
                                color="#aaa"
                            />
                        </TouchableOpacity>

                        {showPasswordSection && (
                            <View style={styles.passwordForm}>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Current Password"
                                    placeholderTextColor="#666"
                                    secureTextEntry
                                    value={currentPassword}
                                    onChangeText={setCurrentPassword}
                                />
                                <TextInput
                                    style={styles.input}
                                    placeholder="New Password"
                                    placeholderTextColor="#666"
                                    secureTextEntry
                                    value={newPassword}
                                    onChangeText={setNewPassword}
                                />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Confirm New Password"
                                    placeholderTextColor="#666"
                                    secureTextEntry
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                />
                                <TouchableOpacity
                                    style={styles.changePasswordBtn}
                                    onPress={handleChangePassword}
                                    disabled={changingPassword}
                                >
                                    {changingPassword ? (
                                        <ActivityIndicator color="white" />
                                    ) : (
                                        <Text style={styles.changePasswordBtnText}>Update Password</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                )}

                {/* About Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>About</Text>

                    <View style={styles.row}>
                        <View style={styles.rowLeft}>
                            <MaterialCommunityIcons name="information" size={22} color="#aaa" />
                            <Text style={styles.rowText}>Version</Text>
                        </View>
                        <Text style={styles.versionText}>{appVersion}</Text>
                    </View>

                    <TouchableOpacity style={styles.row} onPress={() => router.push('/settings/help')}>
                        <View style={styles.rowLeft}>
                            <MaterialCommunityIcons name="help-circle" size={22} color="#aaa" />
                            <Text style={styles.rowText}>Help & Support</Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={22} color="#666" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.row} onPress={() => router.push('/settings/privacy')}>
                        <View style={styles.rowLeft}>
                            <MaterialCommunityIcons name="shield-lock" size={22} color="#aaa" />
                            <Text style={styles.rowText}>Privacy Policy</Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={22} color="#666" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.row} onPress={() => router.push('/settings/terms')}>
                        <View style={styles.rowLeft}>
                            <MaterialCommunityIcons name="file-document" size={22} color="#aaa" />
                            <Text style={styles.rowText}>Terms of Service</Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={22} color="#666" />
                    </TouchableOpacity>
                </View>

                {/* Data Privacy Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Data Privacy</Text>
                    <TouchableOpacity style={styles.row} onPress={handleDownloadData}>
                        <View style={styles.rowLeft}>
                            <MaterialCommunityIcons name="cloud-download-outline" size={22} color="#aaa" />
                            <Text style={styles.rowText}>Download My Data</Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={22} color="#666" />
                    </TouchableOpacity>
                </View>

                {/* Log Out Button */}
                <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                    <MaterialCommunityIcons name="logout" size={20} color="#fff" />
                    <Text style={styles.logoutBtnText}>Log Out</Text>
                </TouchableOpacity>

                {/* Wipe Data Button (Fresh Start) */}
                <TouchableOpacity
                    style={styles.wipeDataBtn}
                    onPress={() => setShowWipeConfirm(!showWipeConfirm)}
                >
                    <MaterialCommunityIcons name="refresh" size={20} color="#FF9800" />
                    <Text style={styles.wipeDataBtnText}>Wipe All Data (Fresh Start)</Text>
                </TouchableOpacity>

                {showWipeConfirm && (
                    <View style={styles.deleteConfirmBox}>
                        <Text style={[styles.deleteWarning, { color: '#FF9800' }]}>
                            This will delete ALL your notebooks and pages to give you a fresh start. Your account will remain active.
                        </Text>
                        {hasPasswordProvider && (
                            <TextInput
                                style={styles.input}
                                placeholder="Enter password to confirm"
                                placeholderTextColor="#666"
                                secureTextEntry
                                value={wipePassword}
                                onChangeText={setWipePassword}
                            />
                        )}
                        <TouchableOpacity
                            style={styles.confirmWipeBtn}
                            onPress={handleWipeData}
                            disabled={wiping}
                        >
                            {wiping ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={styles.confirmDeleteBtnText}>Wipe All Data</Text>
                            )}
                        </TouchableOpacity>

                        {wiping && !!deleteStatus && (
                            <Text style={styles.deleteStatusText}>{deleteStatus}</Text>
                        )}
                    </View>
                )}

                {/* Delete Account Button */}
                <TouchableOpacity
                    style={styles.deleteAccountBtn}
                    onPress={() => setShowDeleteConfirm(!showDeleteConfirm)}
                >
                    <MaterialCommunityIcons name="delete-forever" size={20} color="#e74c3c" />
                    <Text style={styles.deleteAccountBtnText}>Delete Account</Text>
                </TouchableOpacity>

                {showDeleteConfirm && (
                    <View style={styles.deleteConfirmBox}>
                        <Text style={styles.deleteWarning}>
                            This will permanently delete your account and all data. This cannot be undone.
                        </Text>
                        {hasPasswordProvider && (
                            <TextInput
                                style={styles.input}
                                placeholder="Enter your password to confirm"
                                placeholderTextColor="#666"
                                secureTextEntry
                                value={deletePassword}
                                onChangeText={setDeletePassword}
                            />
                        )}
                        <TouchableOpacity
                            style={styles.confirmDeleteBtn}
                            onPress={handleDeleteAccount}
                            disabled={deleting}
                        >
                            {deleting ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={styles.confirmDeleteBtnText}>Delete My Account Forever</Text>
                            )}
                        </TouchableOpacity>

                        {/* Progress Status */}
                        {deleting && !!deleteStatus && (
                            <Text style={styles.deleteStatusText}>{deleteStatus}</Text>
                        )}
                    </View>
                )}

            </ScrollView>
            {/* Deleted Success Modal */}
            < Modal visible={showDeletedModal} transparent animationType="fade" >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        <MaterialCommunityIcons name="delete-empty" size={50} color="#e74c3c" style={{ marginBottom: 10 }} />
                        <Text style={styles.modalTitle}>Account Deleted</Text>
                        <Text style={styles.modalDesc}>Your account has been permanently deleted.</Text>
                        <TouchableOpacity style={styles.modalBtn} onPress={handleDeletedConfirm}>
                            <Text style={styles.modalBtnText}>OK</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal >

            <CustomAlert
                visible={customAlert.visible}
                title={customAlert.title}
                message={customAlert.message}
                buttons={customAlert.buttons}
                onClose={() => setCustomAlert(prev => ({ ...prev, visible: false }))}
            />
        </View >
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
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 12 },

    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rowText: { color: '#ddd', fontSize: 15 },
    notLinked: { color: '#666', fontSize: 14 },
    versionText: { color: '#888', fontSize: 14 },

    passwordForm: { marginTop: 15 },
    input: { backgroundColor: '#252525', borderRadius: 8, padding: 12, color: '#fff', fontSize: 16, marginBottom: 12 },

    changePasswordBtn: { backgroundColor: '#2E7D32', padding: 14, borderRadius: 8, alignItems: 'center' },
    changePasswordBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

    logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#B71C1C', padding: 14, borderRadius: 8, gap: 8, marginBottom: 20, marginTop: 30 },
    logoutBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

    deleteAccountBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e74c3c', padding: 14, borderRadius: 8, gap: 8 },
    deleteAccountBtnText: { color: '#e74c3c', fontSize: 16, fontWeight: '600' },

    wipeDataBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FF9800', padding: 14, borderRadius: 8, gap: 8, marginBottom: 20 },
    wipeDataBtnText: { color: '#FF9800', fontSize: 16, fontWeight: '600' },
    confirmWipeBtn: { backgroundColor: '#FF9800', padding: 14, borderRadius: 8, alignItems: 'center' },

    deleteConfirmBox: { marginTop: 15, padding: 15, backgroundColor: '#2a1a1a', borderRadius: 8 },
    deleteWarning: { color: '#e74c3c', fontSize: 14, marginBottom: 12, lineHeight: 20 },
    confirmDeleteBtn: { backgroundColor: '#c0392b', padding: 14, borderRadius: 8, alignItems: 'center' },
    confirmDeleteBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    deleteStatusText: { color: '#aaa', fontSize: 14, marginTop: 15, textAlign: 'center', fontStyle: 'italic' },

    // Modal Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
    modalContainer: { backgroundColor: '#1e1e1e', padding: 25, borderRadius: 12, width: '85%', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 10, borderWidth: 1, borderColor: '#333' },
    modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 10 },
    modalDesc: { fontSize: 16, color: '#ccc', textAlign: 'center', marginBottom: 25 },
    modalBtn: { backgroundColor: '#e74c3c', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 8, width: '100%', alignItems: 'center' },
    modalBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' }
});
