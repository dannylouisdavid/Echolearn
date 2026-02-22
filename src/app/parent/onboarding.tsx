import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../services/auth/AuthContext';
import { assignInviteCode, getUserByInviteCode, sendInvite } from '../../services/invites';
import { User } from '../../types/schema';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CustomAlert } from '../../components/CustomAlert';

export default function ParentOnboarding() {
    const router = useRouter();
    const { user, userProfile, setProfileLocal } = useAuth();
    const insets = useSafeAreaInsets(); // Add insets for safer header spacing

    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [generatingCode, setGeneratingCode] = useState(false);
    const [successAlert, setSuccessAlert] = useState<{ visible: boolean, message: string, onOk?: () => void }>({ visible: false, message: '' });

    // Search
    const [searchCode, setSearchCode] = useState('');
    const [foundUser, setFoundUser] = useState<User | null>(null);
    const [searching, setSearching] = useState(false);
    const [sendingInvite, setSendingInvite] = useState(false);

    useEffect(() => {
        if (!user) return;
        // Check if user already has an invite code
        if (userProfile?.inviteCode) {
            setInviteCode(userProfile.inviteCode);
        } else {
            // Generate one
            generateCode();
        }
    }, [user, userProfile]);

    const generateCode = async () => {
        if (!user) return;
        setGeneratingCode(true);
        try {
            const code = await assignInviteCode(user.uid);
            setInviteCode(code);
            // Update local context
            if (userProfile) {
                setProfileLocal({ ...userProfile, inviteCode: code });
            }
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Could not generate invite code.");
        } finally {
            setGeneratingCode(false);
        }
    };

    const handleSearch = async () => {
        if (!searchCode.trim()) return;
        setSearching(true);
        setFoundUser(null);
        try {
            const u = await getUserByInviteCode(searchCode.trim());
            if (u) {
                if (u.role !== 'student') {
                    Alert.alert("Invalid User", "Parents can only connect with Students.");
                } else if (u.uid === user?.uid) {
                    Alert.alert("That's you!", "You cannot invite yourself.");
                } else {
                    setFoundUser(u);
                }
            } else {
                Alert.alert("Not Found", "No user found with this code.");
            }
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Search failed.");
        } finally {
            setSearching(false);
        }
    };

    const handleSendInvite = async () => {
        if (!foundUser || !user || !userProfile) return;
        setSendingInvite(true);
        try {
            const type = 'parent_to_student';
            await sendInvite(userProfile, foundUser.email, type);
            setSuccessAlert({
                visible: true,
                message: `Invite sent to ${foundUser.displayName}!`,
                onOk: () => {
                    setSearchCode('');
                    setFoundUser(null);
                }
            });
        } catch (e: any) {
            Alert.alert("Error", e.message || "Could not send invite.");
        } finally {
            setSendingInvite(false);
        }
    };

    const copyCode = async () => {
        if (inviteCode) {
            await Clipboard.setStringAsync(inviteCode);
            Alert.alert("Copied", "Invite code copied to clipboard.");
        }
    };

    const handleNext = () => {
        // Parents go straight to tabs
        router.replace('/parent/(tabs)');
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
            <StatusBar barStyle="light-content" backgroundColor="#121212" />

            <View style={styles.header}>
                <Text style={styles.title}>Welcome Parent!</Text>
                <Text style={styles.sub}>Link students to your account.</Text>
            </View>

            {/* My Code Section */}
            <View style={styles.codeSection}>
                <Text style={styles.label}>Your Invite Code</Text>
                {generatingCode ? (
                    <ActivityIndicator color="#35c128" />
                ) : (
                    <TouchableOpacity style={styles.codeBox} onPress={copyCode}>
                        <Text style={styles.code}>{inviteCode || '...'}</Text>
                        <MaterialCommunityIcons name="content-copy" size={20} color="#888" />
                    </TouchableOpacity>
                )}
                <Text style={styles.hint}>Share this with your child to let them invite you.</Text>
            </View>

            {/* Search Section */}
            <View style={styles.searchSection}>
                <Text style={styles.label}>Find Student</Text>
                <View style={styles.searchRow}>
                    <TextInput
                        style={styles.input}
                        placeholder="Enter Student's Code"
                        placeholderTextColor="#666"
                        value={searchCode}
                        onChangeText={(t) => setSearchCode(t.toUpperCase())}
                        maxLength={6}
                        autoCapitalize="characters"
                    />
                    <TouchableOpacity
                        style={[styles.searchBtn, (!searchCode || searching) && styles.disabledBtn]}
                        onPress={handleSearch}
                        disabled={!searchCode || searching}
                    >
                        {searching ? <ActivityIndicator color="white" /> : <MaterialCommunityIcons name="magnify" size={24} color="white" />}
                    </TouchableOpacity>
                </View>
            </View>

            {/* Found User Card */}
            {foundUser && (
                <View style={styles.userCard}>
                    <View style={styles.userInfo}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{foundUser.displayName.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View>
                            <Text style={styles.userName}>{foundUser.displayName}</Text>
                            <Text style={styles.userRole}>Student</Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        style={[styles.addBtn, sendingInvite && styles.disabledBtn]}
                        onPress={handleSendInvite}
                        disabled={sendingInvite}
                    >
                        {sendingInvite ? <ActivityIndicator color="white" /> : <Text style={styles.addBtnText}>Connect</Text>}
                    </TouchableOpacity>
                </View>
            )}

            <View style={styles.footer}>
                <TouchableOpacity style={styles.skipBtn} onPress={handleNext}>
                    <Text style={styles.skipText}>Skip / Next</Text>
                </TouchableOpacity>
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
    container: { flex: 1, backgroundColor: '#121212', padding: 20 },

    header: { marginBottom: 30 },
    title: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
    sub: { fontSize: 16, color: '#aaa', marginTop: 5 },

    codeSection: { marginBottom: 40, alignItems: 'center', backgroundColor: '#1e1e1e', padding: 20, borderRadius: 12 },
    label: { fontSize: 14, fontWeight: '600', color: '#aaa', marginBottom: 10, alignSelf: 'flex-start' },
    codeBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#252525', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#333' },
    code: { fontSize: 24, fontWeight: 'bold', letterSpacing: 4, color: '#35c128' },
    hint: { fontSize: 12, color: '#666', marginTop: 10 },

    searchSection: { marginBottom: 20 },
    searchRow: { flexDirection: 'row', gap: 10 },
    input: { flex: 1, borderWidth: 1, borderColor: '#333', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#252525', color: '#fff' },
    searchBtn: { backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 15, borderRadius: 8 },
    disabledBtn: { backgroundColor: '#444', opacity: 0.7 },

    userCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, backgroundColor: '#1e1e1e', borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: '#35c128' },
    userInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
    userName: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
    userRole: { fontSize: 12, color: '#888' },
    addBtn: { backgroundColor: '#2E7D32', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
    addBtnText: { color: 'white', fontWeight: '600', fontSize: 12 },

    footer: { flex: 1, justifyContent: 'flex-end', paddingBottom: 20 },
    skipBtn: { width: '100%', padding: 15, alignItems: 'center', backgroundColor: 'transparent', borderRadius: 8, borderWidth: 1, borderColor: '#333' },
    skipText: { color: '#aaa', fontWeight: 'bold', fontSize: 16 }
});
