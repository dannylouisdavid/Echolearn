import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { TeacherProfile } from '../types/schema';

interface TeacherCardProps {
    teacher: TeacherProfile;
    unreadCount?: number; // Optional
    lastMessage?: string; // NEW
    onPress: () => void;
    onProfile: () => void; // Changed from onMessage
}

export default function TeacherCard({ teacher, unreadCount = 0, lastMessage, onPress, onProfile }: TeacherCardProps) {
    return (
        <TouchableOpacity style={styles.card} onPress={onPress}>
            <View style={styles.header}>
                <View style={styles.avatarContainer}>
                    {teacher.photoURL ? (
                        <Image source={{ uri: teacher.photoURL }} style={styles.avatar} />
                    ) : (
                        <View style={[styles.avatar, styles.placeholderAvatar]}>
                            <Text style={styles.avatarText}>
                                {teacher.displayName ? teacher.displayName.charAt(0).toUpperCase() : 'T'}
                            </Text>
                        </View>
                    )}
                    {/* Unread Badge on Avatar (Left) */}
                    {unreadCount > 0 && (
                        <View style={styles.unreadBadge}>
                            <Text style={styles.unreadText}>{unreadCount}</Text>
                        </View>
                    )}
                </View>
                <View style={styles.info}>
                    <Text style={styles.name}>{teacher.displayName}</Text>
                    {/* Show Last Message or Qualification or Fallback */}
                    <Text style={[styles.role, lastMessage && styles.lastMessage]}>
                        {lastMessage
                            ? (lastMessage.length > 35 ? lastMessage.substring(0, 35) + '...' : lastMessage)
                            : (teacher.postGraduation || teacher.graduation || 'Teacher')
                        }
                    </Text>
                </View>
                {/* Profile Button */}
                <TouchableOpacity style={styles.profileBtn} onPress={(e) => {
                    e.stopPropagation(); // Prevent card click
                    onProfile();
                }}>
                    <MaterialCommunityIcons name="account-details" size={24} color="#35c128" />
                </TouchableOpacity>
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#1e1e1e',
        borderRadius: 12,
        padding: 15,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#333'
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    avatarContainer: {
        marginRight: 15
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25
    },
    placeholderAvatar: {
        backgroundColor: 'rgba(53, 193, 40, 0.2)', // The "other" green (background)
        justifyContent: 'center',
        alignItems: 'center'
    },
    avatarText: {
        color: '#35c128', // The primary green for text
        fontSize: 20,
        fontWeight: 'bold'
    },
    info: {
        flex: 1
    },
    name: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold'
    },
    role: {
        color: '#888',
        fontSize: 14
    },
    messageBtn: {
        padding: 5,
    },
    profileBtn: {
        padding: 8,
        backgroundColor: 'rgba(53, 193, 40, 0.1)',
        borderRadius: 8
    },
    unreadBadge: {
        position: 'absolute',
        top: -2,
        right: -2,
        backgroundColor: '#FF3B30',
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: '#1e1e1e',
        zIndex: 10
    },
    unreadText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold'
    },
    lastMessage: {
        color: '#ccc', // Lighter color for message content
        marginTop: 2
    }
});
