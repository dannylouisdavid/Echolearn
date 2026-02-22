import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { TeacherProfile } from '../types/schema';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface TeacherBioModalProps {
    visible: boolean;
    onClose: () => void;
    teacher: TeacherProfile | null;
    unreadCount?: number; // Optional
    onMessage: () => void;
}

export default function TeacherBioModal({ visible, onClose, teacher, unreadCount = 0, onMessage }: TeacherBioModalProps) {
    const insets = useSafeAreaInsets();

    if (!teacher) return null;

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <View style={[styles.container, { paddingTop: 20 }]}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <MaterialCommunityIcons name="close" size={24} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Teacher Profile</Text>
                    <TouchableOpacity style={styles.messageBtn} onPress={onMessage}>
                        <MaterialCommunityIcons name="message-text" size={24} color="#35c128" />
                        {unreadCount > 0 && (
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>{unreadCount}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={styles.content}>
                    {/* Profile Header */}
                    <View style={styles.profileHeader}>
                        {teacher.photoURL ? (
                            <Image source={{ uri: teacher.photoURL }} style={styles.avatar} />
                        ) : (
                            <View style={[styles.avatar, styles.placeholderAvatar]}>
                                <Text style={styles.avatarText}>
                                    {teacher.displayName ? teacher.displayName.charAt(0).toUpperCase() : 'T'}
                                </Text>
                            </View>
                        )}
                        <Text style={styles.name}>{teacher.displayName}</Text>
                        <Text style={styles.email}>{teacher.email}</Text>
                    </View>

                    {/* Bio */}
                    {teacher.bio && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>About</Text>
                            <Text style={styles.bioText}>{teacher.bio}</Text>
                        </View>
                    )}

                    {/* Education */}
                    {(teacher.postGraduation || teacher.graduation) && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Education</Text>
                            {teacher.postGraduation && (
                                <View style={styles.eduItem}>
                                    <MaterialCommunityIcons name="school" size={20} color="#35c128" style={{ marginTop: 2 }} />
                                    <View>
                                        <Text style={styles.eduTitle}>Post Graduation</Text>
                                        <Text style={styles.eduValue}>{teacher.postGraduation}</Text>
                                    </View>
                                </View>
                            )}
                            {teacher.graduation && (
                                <View style={styles.eduItem}>
                                    <MaterialCommunityIcons name="school-outline" size={20} color="#35c128" style={{ marginTop: 2 }} />
                                    <View>
                                        <Text style={styles.eduTitle}>Graduation</Text>
                                        <Text style={styles.eduValue}>{teacher.graduation}</Text>
                                    </View>
                                </View>
                            )}
                        </View>
                    )}

                    {/* Certs & Awards */}
                    {teacher.professionalCertificates && teacher.professionalCertificates.length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Certificates</Text>
                            {teacher.professionalCertificates.map((cert, index) => (
                                <View key={index} style={styles.listItem}>
                                    <MaterialCommunityIcons name="certificate" size={18} color="#FFC107" />
                                    <Text style={styles.listText}>{cert}</Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {teacher.awards && teacher.awards.length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Awards</Text>
                            {teacher.awards.map((award, index) => (
                                <View key={index} style={styles.listItem}>
                                    <MaterialCommunityIcons name="trophy" size={18} color="#FF9800" />
                                    <Text style={styles.listText}>{award}</Text>
                                </View>
                            ))}
                        </View>
                    )}

                </ScrollView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#333' },
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    closeBtn: { padding: 5 },
    messageBtn: { padding: 5 },

    content: { padding: 20 },
    profileHeader: { alignItems: 'center', marginBottom: 30 },
    avatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 15 },
    placeholderAvatar: { backgroundColor: 'rgba(53, 193, 40, 0.2)', justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: '#35c128', fontSize: 40, fontWeight: 'bold' },
    name: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 5 },
    email: { color: '#888', fontSize: 16 },

    section: { marginBottom: 25, backgroundColor: '#1e1e1e', padding: 15, borderRadius: 12 },
    sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 15 },
    bioText: { color: '#ccc', fontSize: 15, lineHeight: 22 },

    eduItem: { flexDirection: 'row', gap: 15, marginBottom: 15 },
    eduTitle: { color: '#888', fontSize: 13, textTransform: 'uppercase', fontWeight: 'bold' },
    eduValue: { color: '#fff', fontSize: 16, marginTop: 2 },

    listItem: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    listText: { color: '#ddd', fontSize: 15 },

    badge: {
        position: 'absolute',
        top: -5,
        right: -5,
        backgroundColor: '#FF3B30',
        borderRadius: 10,
        minWidth: 18,
        height: 18,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
        borderWidth: 1.5,
        borderColor: '#1e1e1e'
    },
    badgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold'
    }
});
