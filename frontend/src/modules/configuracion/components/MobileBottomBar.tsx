import { theme, Typography } from 'antd';
import { clickable } from '@core/utils/a11y';

const { Text } = Typography;

interface MobileBottomBarProps {
    items: Array<{
        key: string;
        icon: React.ReactNode;
        label: string;
        onClick: () => void;
        primary?: boolean;
    }>;
}

export const MobileBottomBar = ({ items }: MobileBottomBarProps) => {
    const { token } = theme.useToken();

    return (
        <div style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            background: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderTop: `1px solid ${token.colorBorderSecondary}`,
            padding: `${token.paddingXS}px ${token.paddingMD}px`,
            paddingBottom: `calc(${token.paddingXS}px + env(safe-area-inset-bottom, 0px))`,
            display: 'flex',
            justifyContent: 'space-evenly',
            gap: token.marginXS,
        }}>
            {items.map(item => (
                <div
                    key={item.key}
                    {...clickable(item.onClick)}
                    style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2,
                        padding: `${token.paddingXS}px 0`,
                        borderRadius: token.borderRadiusLG,
                        cursor: 'pointer',
                        minHeight: 56,
                        color: item.primary ? token.colorPrimary : token.colorTextSecondary,
                        transition: 'background 0.15s',
                    }}
                    onTouchStart={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = token.colorFillSecondary;
                    }}
                    onTouchEnd={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                    }}
                >
                    <span style={{ fontSize: 22, lineHeight: 1, display: 'flex' }}>{item.icon}</span>
                    <Text style={{
                        fontSize: 11,
                        color: 'inherit',
                        lineHeight: 1.2,
                        fontWeight: item.primary ? 600 : 400,
                    }}>
                        {item.label}
                    </Text>
                </div>
            ))}
        </div>
    );
};
