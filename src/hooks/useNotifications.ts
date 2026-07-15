import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { Notification } from '../types/schema';
import { markAllRead, deleteNotification, markAsRead } from '../services/notifications';
import { Alert } from 'react-native';

export function useNotifications(userId?: string) {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const prevCountRef = useRef(0);
    const isFirstLoad = useRef(true);

    useEffect(() => {
        if (!userId) {
            setNotifications([]);
            setUnreadCount(0);
            return;
        }

        const q = query(
            collection(db, 'notifications'),
            where('userId', '==', userId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Notification));
            // Client-side sort locally
            list.sort((a, b) => b.createdAt - a.createdAt);

            setNotifications(list);

            const newUnreadCount = list.filter(n => !n.read).length;
            setUnreadCount(newUnreadCount);

            // Pop-up Alert Logic
            if (!isFirstLoad.current && newUnreadCount > prevCountRef.current) {
                // Find the newest unread to show title
                const newest = list.find(n => !n.read);
                if (newest) {
                    Alert.alert("New Notification", newest.title);
                }
            }

            prevCountRef.current = newUnreadCount;
            if (isFirstLoad.current) isFirstLoad.current = false;
        });

        return () => unsubscribe();
    }, [userId]);

    const handleMarkAllRead = async () => {
        if (userId) await markAllRead(userId);
    };

    const handleMarkAsRead = async (notificationId: string) => {
        await markAsRead(notificationId);
    };

    const handleDelete = async (id: string) => {
        await deleteNotification(id);
    };

    return {
        notifications,
        unreadCount,
        markAllAsRead: handleMarkAllRead,
        markAsRead: handleMarkAsRead,
        deleteNotification: handleDelete
    };
}
