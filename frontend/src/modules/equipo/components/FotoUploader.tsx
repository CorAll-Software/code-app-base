import { Avatar, Button, Modal, Spin, theme } from 'antd';
import { CameraOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { useRef, useState } from 'react';
import { getInitials } from '@src/core/parse';
import { getColorString } from '@src/core/color';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_MB = 5;

interface FotoUploaderProps {
    foto_url?: string | null;
    nombres: string;
    apellidos: string;
    onUpload: (file: File) => Promise<string | null>;
    onRemove: () => void;
    disabled?: boolean;
    size?: number;
}

interface FotoPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    fotoUrl: string;
    onRemove: () => void;
    onChangePhoto: () => void;
    fullName: string;
}

const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
        return 'Solo se permiten imágenes JPEG, PNG o WebP';
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        return `La imagen no puede superar ${MAX_SIZE_MB} MB`;
    }
    return null;
};

export const FotoPreviewModal = ({
    isOpen,
    onClose,
    fotoUrl,
    onRemove,
    onChangePhoto,
    fullName,
}: FotoPreviewModalProps) => (
    <Modal
        open={isOpen}
        onCancel={onClose}
        title="Vista previa de la foto"
        footer={[
            <Button key="change" icon={<UploadOutlined />} onClick={onChangePhoto}>
                Cambiar foto
            </Button>,
            <Button key="remove" danger icon={<DeleteOutlined />} onClick={onRemove}>
                Eliminar actual
            </Button>,
        ]}
        destroyOnClose
        centered
    >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', gap: 12 }}>
            <Avatar src={fotoUrl} size={160} alt={fullName} />
            <div style={{ fontWeight: 500, fontSize: 16 }}>{fullName}</div>
        </div>
    </Modal>
);

export const FotoAvatar = ({
    displayUrl,
    size,
    fullName,
    colorBorderSecondary,
}: {
    displayUrl: string | null;
    size: number;
    fullName: string;
    colorBorderSecondary: string;
}) => {
    if (displayUrl) {
        return (
            <Avatar
                src={displayUrl}
                size={size}
                style={{ border: `2px solid ${colorBorderSecondary}` }}
            />
        );
    }
    return (
        <Avatar
            size={size}
            style={{
                backgroundColor: getColorString(fullName),
                fontSize: size * 0.35,
                fontWeight: 600,
                border: `2px solid ${colorBorderSecondary}`,
            }}
        >
            {getInitials(fullName)}
        </Avatar>
    );
};

export const AvatarTrigger = ({
    disabled,
    pendingFile,
    uploading,
    displayUrl,
    size,
    fullName,
    token,
    onClick,
}: {
    disabled: boolean;
    pendingFile: File | null;
    uploading: boolean;
    displayUrl: string | null;
    size: number;
    fullName: string;
    token: { colorBorderSecondary: string; colorPrimary: string; boxShadow: string };
    onClick: () => void;
}) => (
    <div style={{ position: 'relative', cursor: disabled ? 'default' : 'pointer' }} onClick={onClick}>
        <Spin spinning={uploading}>
            <FotoAvatar displayUrl={displayUrl} size={size} fullName={fullName} colorBorderSecondary={token.colorBorderSecondary} />
            {!disabled && !pendingFile && (
                <div style={{
                    position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: '50%',
                    background: token.colorPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: token.boxShadow,
                }}>
                    <CameraOutlined style={{ color: '#fff', fontSize: 12 }} />
                </div>
            )}
        </Spin>
    </div>
);

export const PendingActions = ({
    pendingFile,
    uploading,
    onSave,
    onDiscard,
}: {
    pendingFile: File | null;
    uploading: boolean;
    onSave: () => void;
    onDiscard: () => void;
}) => {
    if (!pendingFile) return null;
    return (
        <div style={{ display: 'flex', gap: 6 }}>
            <Button size="small" type="primary" icon={<UploadOutlined />} onClick={onSave} loading={uploading}>
                Guardar foto
            </Button>
            <Button size="small" onClick={onDiscard} disabled={uploading}>
                Cancelar
            </Button>
        </div>
    );
};

export const FotoUploader = ({
    foto_url,
    nombres,
    apellidos,
    onUpload,
    onRemove,
    disabled = false,
    size = 80,
}: FotoUploaderProps) => {
    const { token } = theme.useToken();
    const inputRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fullName = `${nombres} ${apellidos}`.trim();
    const displayUrl = preview || foto_url;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const err = validateFile(file);
        if (err) {
            setError(err);
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => setPreview(reader.result as string);
        reader.readAsDataURL(file);
        setPendingFile(file);
        e.target.value = '';
    };

    const handleSave = async () => {
        if (!pendingFile) return;
        setUploading(true);
        try {
            const url = await onUpload(pendingFile);
            if (url) {
                setPreview(null);
                setPendingFile(null);
            }
        } finally {
            setUploading(false);
        }
    };

    const handleAvatarClick = () => {
        if (disabled) return;
        if (foto_url) {
            setIsModalOpen(true);
        } else {
            inputRef.current?.click();
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleFileChange} disabled={disabled} title="Seleccionar foto de perfil" />
            <AvatarTrigger disabled={disabled} pendingFile={pendingFile} uploading={uploading} displayUrl={displayUrl} size={size} fullName={fullName} token={token} onClick={handleAvatarClick} />
            {error && <span style={{ color: token.colorError, fontSize: 11 }}>{error}</span>}
            <PendingActions pendingFile={pendingFile} uploading={uploading} onSave={handleSave} onDiscard={() => { setPreview(null); setPendingFile(null); setError(null); }} />
            {foto_url && (
                <FotoPreviewModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    fotoUrl={foto_url}
                    onRemove={() => { setIsModalOpen(false); onRemove(); }}
                    onChangePhoto={() => { setIsModalOpen(false); inputRef.current?.click(); }}
                    fullName={fullName}
                />
            )}
        </div>
    );
};

