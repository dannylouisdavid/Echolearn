import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
    handleNotification: async (notification: Notifications.Notification) => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export async function registerForPushNotificationsAsync() {
    let token;

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        return;
    }

    try {
        const projectToken = await Notifications.getExpoPushTokenAsync();
        token = projectToken.data;
    } catch (e) {
        console.error("Error fetching push token", e);
    }

    return token;
}

export async function scheduleReviewNotification(title: string, triggerSeconds: number) {
    if (triggerSeconds <= 0) return; // Don't schedule if immediate/past

    // Ensure at least 60 seconds (1 minute) to avoid OS limitations/errors
    const seconds = Math.max(triggerSeconds, 60);

    await Notifications.scheduleNotificationAsync({
        content: {
            title: "Time to Review!",
            body: `Review topic: ${title} to keep your memory fresh.`,
            data: { url: '/student/dashboard' },
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: seconds,
            repeats: false
        },
    });
}

// --- Firestore Notifications ---

import { addDoc, collection, updateDoc, doc, getDocs, query, where, orderBy, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { Notification } from '../types/schema';

export const createNotification = async (userId: string, title: string, message: string, type: 'invite_rejected' | 'invite_accepted' | 'other', relatedId?: string) => {
    try {
        await addDoc(collection(db, 'notifications'), {
            userId,
            title,
            message,
            type,
            relatedId,
            read: false,
            createdAt: Date.now()
        });
    } catch (e) {
        console.error("Error creating notification", e);
    }
};

export const getNotifications = async (userId: string) => {
    try {
        const q = query(
            collection(db, 'notifications'),
            where('userId', '==', userId)
        );
        const snap = await getDocs(q);
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification));
        return data.sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) {
        console.error("Error fetching notifications", e);
        return [];
    }
};

export const markAsRead = async (notificationId: string) => {
    try {
        await updateDoc(doc(db, 'notifications', notificationId), {
            read: true
        });
    } catch (e) {
        console.error("Error marking read", e);
    }
}


export const deleteNotification = async (notificationId: string) => {
    try {
        await deleteDoc(doc(db, 'notifications', notificationId));
    } catch (e) {
        console.error("Error deleting notification", e);
    }
};

export const markAllRead = async (userId: string) => {
    try {
        const q = query(
            collection(db, 'notifications'),
            where('userId', '==', userId),
            where('read', '==', false)
        );
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.docs.forEach(d => {
            batch.update(d.ref, { read: true });
        });
        await batch.commit();
    } catch (e) {
        console.error("Error marking all read", e);
    }
};
