import { Elysia, t } from 'elysia';
import { configServer } from '@/config';

/*
    Cap · CAPTCHA autoalojado (https://trycap.dev)

    El widget del navegador resuelve un reto de prueba-de-trabajo y entrega un
    token de un solo uso en el campo `cap-token` del body. Aquí lo canjeamos
    contra `siteverify` de la instancia Cap ANTES de ejecutar el handler.

    Un token solo es válido una vez: la instancia lo consume al validarlo, de
    modo que reenviar el mismo token es rechazado automáticamente.
*/

/** Nombre del campo que usa el widget por defecto. */
export const CAPTCHA_FIELD = 'cap-token';

/** Fragmento a esparcir en el `t.Object` del body de un endpoint protegido. */
export const captchaBodyField = {
    [CAPTCHA_FIELD]: t.Optional(t.String()),
};

type CaptchaFailure = { status: number; message: string };

const MSG_MISSING = 'Completa la verificación anti-bot antes de continuar.';
const MSG_INVALID = 'La verificación anti-bot no es válida o ha expirado. Inténtalo de nuevo.';
const MSG_UNAVAILABLE = 'No se pudo completar la verificación anti-bot. Inténtalo de nuevo en unos momentos.';

if (!configServer.captcha.enabled) {
    console.warn('[Cap] CAPTCHA desactivado: define CAP_API_ENDPOINT y CAP_SECRET_KEY para proteger los endpoints públicos.');
}

/**
 * Canjea un token Cap contra la instancia configurada.
 * Devuelve `null` si el token es válido (o si el CAPTCHA está desactivado),
 * o el error a responder en caso contrario.
 *
 * Falla cerrado: si la instancia Cap no responde, la petición se rechaza.
 */
export const verifyCaptcha = async (token?: unknown): Promise<CaptchaFailure | null> => {
    if (!configServer.captcha.enabled) return null;

    // 1. Token ausente o vacío
    if (typeof token !== 'string' || !token.trim()) {
        return { status: 400, message: MSG_MISSING };
    }

    // 2. Canje contra la instancia Cap (con timeout: nunca colgamos el request)
    let response: Response;
    try {
        response = await fetch(`${configServer.captcha.apiEndpoint}siteverify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret: configServer.captcha.secretKey,
                response: token.trim(),
            }),
            signal: AbortSignal.timeout(configServer.captcha.timeoutMs),
        });
    } catch (error) {
        console.error('[Cap] Servidor de CAPTCHA inalcanzable:', (error as Error)?.message ?? error);
        return { status: 503, message: MSG_UNAVAILABLE };
    }

    // 3. 5xx = instancia caída (reintentable) · 4xx = token/secreto rechazado
    if (response.status >= 500) {
        console.error(`[Cap] siteverify respondió ${response.status}`);
        return { status: 503, message: MSG_UNAVAILABLE };
    }

    const result = await response.json().catch(() => null) as { success?: boolean } | null;

    // 4. Token inválido, ya usado o expirado
    if (!result?.success) return { status: 403, message: MSG_INVALID };

    return null;
};

export const captchaPlugin = new Elysia({ name: 'captcha-plugin' })
    .macro({
        /**
         * `requireCaptcha: true` exige un token Cap válido en el body (`cap-token`).
         * Recuerda añadir `...captchaBodyField` al esquema del body.
         */
        requireCaptcha(enabled: boolean) {
            if (!enabled) return {};
            return {
                async beforeHandle({ body, set }) {
                    const failure = await verifyCaptcha((body as any)?.[CAPTCHA_FIELD]);
                    if (failure) {
                        set.status = failure.status;
                        return { message: failure.message };
                    }
                }
            };
        }
    });
