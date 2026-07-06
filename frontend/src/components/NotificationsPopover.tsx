import React, { useEffect, useState } from 'react'
import { Popover, Badge, Button } from 'antd'
import { BellOutlined, CheckOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { useNotificationsStore, AppNotification } from '@src/store/notifications.store'

const MODULE_COLORS: Record<string, { bg: string; color: string; border: string; accent: string }> = {
    helpdesk:    { bg: '#e6f7ff', color: '#1890ff', border: '#91d5ff', accent: '#1890ff' },
    erp:         { bg: '#f9f0ff', color: '#722ed1', border: '#d3adf7', accent: '#722ed1' },
    cajachica:   { bg: '#f6ffed', color: '#52c41a', border: '#b7eb8f', accent: '#52c41a' },
    inventario:  { bg: '#fff7e6', color: '#fa8c16', border: '#ffd591', accent: '#fa8c16' },
    crm:         { bg: '#fff0f6', color: '#eb2f96', border: '#ffadd2', accent: '#eb2f96' },
    finanzas:    { bg: '#fff2e8', color: '#fa541c', border: '#ffbb96', accent: '#fa541c' },
    rrhh:        { bg: '#e6fffb', color: '#13c2c2', border: '#87e8de', accent: '#13c2c2' },
    adelantos:   { bg: '#f0f5ff', color: '#2f54eb', border: '#adc6ff', accent: '#2f54eb' },
    horasextras:  { bg: '#fcffe6', color: '#a0d911', border: '#eaff8f', accent: '#a0d911' },
    experiencia:  { bg: '#f0fff4', color: '#389e0d', border: '#b7eb8f', accent: '#52c41a' },
    reembolsos:   { bg: '#fff2e8', color: '#d4380d', border: '#ffbb96', accent: '#fa541c' },
    projects:     { bg: '#f9f0ff', color: '#722ed1', border: '#d3adf7', accent: '#722ed1' },
    legal:        { bg: '#fff1f0', color: '#cf1322', border: '#ffa39e', accent: '#f5222d' },
    hardware:     { bg: '#e6f7ff', color: '#0958d9', border: '#91caff', accent: '#1677ff' },
    marketing:    { bg: '#fff0f6', color: '#c41d7f', border: '#ffadd2', accent: '#eb2f96' },
}

const DEFAULT_STYLE = { bg: '#f5f5f5', color: '#8c8c8c', border: '#d9d9d9', accent: '#d9d9d9' }

const getModuleStyle = (moduleName?: string) => {
    if (!moduleName) return DEFAULT_STYLE
    const key = moduleName.toLowerCase().replace(/[\s-_]/g, '')
    return MODULE_COLORS[key] || DEFAULT_STYLE
}

interface ItemProps {
    notification: AppNotification
    onRead: (id: string) => void
    onClose: () => void
}

export const NotificationItem: React.FC<ItemProps> = ({ notification, onRead, onClose }) => {
    const navigate = useNavigate()
    const [hovered, setHovered] = useState(false)
    const style = getModuleStyle(notification.module)
    const isUnread = !notification.is_read

    const handleNavigate = () => {
        onRead(notification.id)
        onClose()
        if (notification.link) navigate(notification.link)
    }

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: 'flex',
                borderBottom: '1px solid #f5f5f5',
                background: hovered ? '#fafafa' : '#fff',
                transition: 'background 0.15s',
            }}
        >
            <div style={{
                width: 3,
                flexShrink: 0,
                background: isUnread ? style.accent : 'transparent',
            }} />

            <div style={{ padding: '11px 14px 10px 12px', flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isUnread && (
                            <span style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: '#1677ff',
                                flexShrink: 0,
                                display: 'inline-block',
                            }} />
                        )}
                        <span style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: 3,
                            background: style.bg,
                            color: style.color,
                            border: `1px solid ${style.border}`,
                            lineHeight: '17px',
                        }}>
                            {notification.module || 'General'}
                        </span>
                    </div>
                    <span style={{ fontSize: 11, color: '#bfbfbf', flexShrink: 0, marginLeft: 8 }}>
                        {dayjs(notification.created_at).fromNow()}
                    </span>
                </div>

                <div style={{
                    fontSize: 13,
                    fontWeight: isUnread ? 600 : 500,
                    color: '#262626',
                    marginBottom: 2,
                    lineHeight: '1.4',
                }}>
                    {notification.title}
                </div>

                <div style={{ fontSize: 12, color: '#8c8c8c', lineHeight: '1.5' }}>
                    {notification.message}
                </div>

                {hovered && (isUnread || notification.link) && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 6 }}>
                        {isUnread && (
                            <Button
                                size="small"
                                type="text"
                                icon={<CheckOutlined />}
                                onClick={() => onRead(notification.id)}
                                style={{ fontSize: 12, color: '#8c8c8c', padding: '0 6px', height: 24 }}
                            >
                                Leída
                            </Button>
                        )}
                        {notification.link && (
                            <Button
                                size="small"
                                type="link"
                                onClick={handleNavigate}
                                style={{ fontSize: 12, padding: '0 6px', height: 24 }}
                            >
                                Ver →
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

interface ListProps {
    notifications: AppNotification[]
    onRead: (id: string) => void
    onClose: () => void
}

export const NotificationList: React.FC<ListProps> = ({ notifications, onRead, onClose }) => {
    if (notifications.length === 0) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '36px 24px 32px',
                gap: 12,
                background: '#fff',
            }}>
                <div style={{
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    background: '#f5f5f5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <BellOutlined style={{ fontSize: 22, color: '#bfbfbf' }} />
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#434343', marginBottom: 3 }}>
                        Estás al día
                    </div>
                    <div style={{ fontSize: 12, color: '#bfbfbf' }}>
                        No tienes notificaciones nuevas
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {notifications.map((n) => (
                <NotificationItem key={n.id} notification={n} onRead={onRead} onClose={onClose} />
            ))}
        </div>
    )
}

interface HeaderProps {
    unreadCount: number
    onMarkAll: () => void
}

export const PopoverHeader: React.FC<HeaderProps> = ({ unreadCount, onMarkAll }) => (
    <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 20px',
        background: '#fafafa',
        borderBottom: '1px solid #f0f0f0',
    }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BellOutlined style={{ fontSize: 16, color: '#434343' }} />
            <span style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a', letterSpacing: '-0.1px' }}>Notificaciones</span>
            {unreadCount > 0 && (
                <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    background: '#1677ff',
                    color: '#fff',
                    borderRadius: 10,
                    padding: '1px 7px',
                    lineHeight: '18px',
                }}>
                    {unreadCount}
                </span>
            )}
        </div>
        {unreadCount > 0 && (
            <Button type="link" size="small" onClick={onMarkAll} style={{ padding: 0, fontSize: 12 }}>
                Marcar todas
            </Button>
        )}
    </div>
)

export const NotificationsPopover: React.FC = () => {
    const [open, setOpen] = useState(false)
    const { notifications, unreadCount, fetchNotifications, markAsRead, markAllAsRead } = useNotificationsStore()

    useEffect(() => {
        fetchNotifications()
    }, [fetchNotifications])

    const content = (
        <div>
            <PopoverHeader unreadCount={unreadCount} onMarkAll={markAllAsRead} />
            <NotificationList notifications={notifications} onRead={markAsRead} onClose={() => setOpen(false)} />
        </div>
    )

    return (
        <Popover
            content={content}
            trigger="click"
            open={open}
            onOpenChange={setOpen}
            placement="bottomRight"
            styles={{ container: { padding: 0, overflow: 'hidden', width: 340 } }}
        >
            <Badge count={unreadCount} overflowCount={99} size="small" offset={[-2, 6]} style={{ cursor: 'pointer' }}>
                <Button
                    type="text"
                    icon={<BellOutlined style={{ fontSize: 20, color: '#fff' }} />}
                    style={{ color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    aria-label="Notificaciones"
                />
            </Badge>
        </Popover>
    )
}
