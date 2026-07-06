import React from 'react'
import { Avatar, Tooltip, theme } from 'antd'
import { UserOutlined } from '@ant-design/icons'
import { getColorString } from '@src/core/color'

export interface UserAvatarGroupProps {
    /** Una lista de usuarios o un solo usuario */
    users?: { id: number; name: string }[] | { id: number; name: string }
    /** Máximo de avatares a mostrar antes de agrupar (+N) */
    max?: number
    /** Tamaño del avatar en píxeles */
    size?: number
    /** Tamaño de fuente interna */
    fontSize?: number
    /** Peso de la fuente */
    fontWeight?: number
    /** Ancho del borde */
    borderWidth?: number
    /** Texto para el estado sin asignar */
    emptyTitle?: string
    /** Clase CSS adicional */
    className?: string
    /** Estilos CSS adicionales */
    style?: React.CSSProperties
}

/**
 * Componente estandarizado para mostrar grupos de avatares de responsables/usuarios.
 * Gestiona automáticamente los colores basados en el nombre, tooltips y estados vacíos.
 */
export const UserAvatarGroup: React.FC<UserAvatarGroupProps> = ({
    users,
    max = 2,
    size = 22,
    fontSize = 10,
    fontWeight = 700,
    borderWidth = 1,
    emptyTitle = 'Sin asignar',
    style,
    className
}) => {
    const { token } = theme.useToken()
    
    // Normalizar a una lista de usuarios
    const userList = Array.isArray(users) ? users : (users ? [users] : [])
    
    // Estado sin asignar
    if (userList.length === 0) {
        return (
            <Tooltip title={emptyTitle}>
                <Avatar
                    size={size}
                    style={{
                        background: token.colorFillAlter,
                        fontSize: fontSize,
                        fontWeight: fontWeight,
                        border: `${borderWidth}px solid ${token.colorBorderSecondary}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        ...style
                    }}
                    className={className}
                >
                    <UserOutlined style={{ fontSize: fontSize + 2, color: token.colorTextDescription }} />
                </Avatar>
            </Tooltip>
        )
    }

    return (
        <Avatar.Group
            max={{ 
                count: max, 
                style: { 
                    color: token.colorTextSecondary, 
                    backgroundColor: token.colorFillAlter, 
                    fontSize: fontSize, 
                    fontWeight: 700,
                    border: `${borderWidth}px solid ${token.colorBorderSecondary}`
                } 
            }}
            size={size}
            className={className}
            style={style}
        >
            {userList.map(u => (
                <Tooltip key={u.id} title={u.name} placement="top">
                    <Avatar
                        size={size}
                        style={{
                            backgroundColor: getColorString(u.name),
                            fontSize: fontSize,
                            fontWeight: fontWeight,
                            border: `${borderWidth}px solid ${token.colorBorderSecondary}`
                        }}
                    >
                        {u.name.charAt(0).toUpperCase()}
                    </Avatar>
                </Tooltip>
            ))}
        </Avatar.Group>
    )
}
