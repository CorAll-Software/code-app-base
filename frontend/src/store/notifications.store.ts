import { create } from 'zustand'
import { GET, PUT } from '@src/core/http'

export interface AppNotification {
    id: string;
    user_id: number;
    title: string;
    message: string;
    type: string;
    module?: string;
    link?: string;
    is_read: boolean;
    created_at: string;
}

interface NotificationsResponse {
    notifications: AppNotification[];
    unreadCount: number;
}

interface NotificationsState {
    notifications: AppNotification[]
    unreadCount: number
    loading: boolean
    fetchNotifications: () => Promise<void>
    markAsRead: (id: string) => Promise<void>
    markAllAsRead: () => Promise<void>
    addNotification: (notification: AppNotification) => void
}

export const useNotificationsStore = create<NotificationsState>()((set, get) => ({
    notifications: [],
    unreadCount: 0,
    loading: false,

    fetchNotifications: async () => {
        set({ loading: true })
        try {
            const res = await GET<NotificationsResponse>('notifications', { hideNotification: true })
            set({
                notifications: res.notifications || [],
                unreadCount: res.unreadCount || 0,
                loading: false
            })
        } catch (error) {
            set({ loading: false })
            console.error('Error fetching notifications:', error)
        }
    },

    markAsRead: async (id: string) => {
        const prevNotifications = get().notifications
        const prevUnreadCount = get().unreadCount

        set({
            notifications: prevNotifications.map(n => n.id === id ? { ...n, is_read: true } : n),
            unreadCount: Math.max(0, prevUnreadCount - 1)
        })

        try {
            await PUT(`notifications/${id}/read`, { hideNotification: true })
        } catch (error) {
            set({
                notifications: prevNotifications,
                unreadCount: prevUnreadCount
            })
            console.error('Error marking notification as read:', error)
        }
    },

    markAllAsRead: async () => {
        const prevNotifications = get().notifications
        const prevUnreadCount = get().unreadCount

        set({
            notifications: prevNotifications.map(n => ({ ...n, is_read: true })),
            unreadCount: 0
        })

        try {
            await PUT('notifications/read-all', { hideNotification: true })
        } catch (error) {
            set({
                notifications: prevNotifications,
                unreadCount: prevUnreadCount
            })
            console.error('Error marking all notifications as read:', error)
        }
    },

    addNotification: (notification: AppNotification) => {
        set(state => {
            if (state.notifications.some(n => n.id === notification.id)) {
                return state
            }
            return {
                notifications: [notification, ...state.notifications],
                unreadCount: state.unreadCount + 1
            }
        })
    }
}))
