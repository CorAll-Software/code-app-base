import { PUT, POST } from '@src/core/http';
import { useSocket } from '@src/core/ws';
import { withCaptcha } from '@src/core/captcha';

const userActive = () => useSocket('user-active', {})

const updateProfile = async (params: any, options: { hideNotification?: boolean } = {}) => {
    return PUT('auth/update-profile', {
        msgSuccess: 'Perfil actualizado correctamente',
        msgError: 'Error al actualizar el perfil',
        params,
        ...options
    })
        .then(res => {
            return res
        })
        .catch((err) => {
            if (options.hideNotification) throw err;
            return null
        })
}

const updatePassword = async (params: any) => {
    return PUT('auth/update-password', {
        msgSuccess: 'Contraseña actualizada correctamente',
        msgError: 'Error al actualizar la contraseña',
        params
    })
        .then(res => {
            return res
        })
        .catch(() => null)
}

// Funciones para recuperación de contraseña
const forgotPassword = async (email: string, capToken?: string) => {
    return POST('auth/forgot-password', {
        // El backend responde igual exista o no la cuenta (no revela qué
        // correos están registrados), así que el mensaje tampoco lo afirma.
        msgSuccess: 'Si el correo pertenece a una cuenta activa, te llegará un código. Revisa tu bandeja de entrada o spam.',
        msgError: 'No se pudo procesar la solicitud. Por favor, intenta más tarde.',
        params: withCaptcha({ email }, capToken)
    })
        .then(res => {
            return res
        })
        .catch(() => null)
}

const validateRecoveryCode = async (email: string, recovery_code: string, capToken?: string) => {
    return POST('auth/validate-recovery-code', {
        msgError: 'El código ingresado es inválido o ya ha expirado.',
        params: withCaptcha({ email, recovery_code }, capToken)
    })
        .then(res => {
            return res
        })
        .catch(() => null)
}

const resetPassword = async (email: string, recovery_code: string, new_password: string, capToken?: string) => {
    return POST('auth/reset-password', {
        msgSuccess: '¡Tu contraseña ha sido restablecida con éxito!',
        msgError: 'Hubo un problema al restablecer tu contraseña. Por favor, intenta de nuevo.',
        params: withCaptcha({ email, recovery_code, new_password }, capToken)
    })
        .then(res => {
            return res
        })
        .catch(() => null)
}

export const authService = {
    userActive,
    updateProfile,
    updatePassword,
    forgotPassword,
    validateRecoveryCode,
    resetPassword
}