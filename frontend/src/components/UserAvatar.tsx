import { Avatar, Tooltip } from 'antd';
import { getInitials } from '@src/core/parse';
import { getColorString } from '@src/core/color';

interface UserAvatarProps {
    userId?: number;
    name?: string;
    fotoUrl?: string | null;
    size?: number;
    showName?: boolean;
}

export const UserAvatar = ({ name = '', fotoUrl, size = 32, showName = false }: UserAvatarProps) => {
    const avatar = fotoUrl ? (
        <Avatar src={fotoUrl} size={size} />
    ) : (
        <Avatar
            size={size}
            style={{
                backgroundColor: getColorString(name),
                fontSize: size * 0.4,
                fontWeight: 600,
                flexShrink: 0,
            }}
        >
            {getInitials(name)}
        </Avatar>
    );

    if (showName) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {avatar}
                <span>{name}</span>
            </div>
        );
    }

    return name ? <Tooltip title={name}>{avatar}</Tooltip> : avatar;
};
