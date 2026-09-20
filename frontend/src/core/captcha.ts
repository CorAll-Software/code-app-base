/**
 * Cap · CAPTCHA autoalojado (https://trycap.dev)
 *
 * El endpoint se inyecta desde `index.html` (`VITE_CAP_API_ENDPOINT`), igual que
 * `_routeApi` / `_routeWs`. Si queda vacío el CAPTCHA se desactiva por completo:
 * la plantilla arranca sin necesidad de una instancia Cap.
 *
 * El backend valida el token de forma independiente (`core/captcha.guard.ts`);
 * lo de aquí es solo la parte de UI.
 */

/** Nombre del campo con el que viaja el token al backend. */
export const CAPTCHA_FIELD = 'cap-token'

const rawEndpoint = (window._routeCaptcha || '').trim()

/** Endpoint de la instancia Cap, siempre con barra final. */
export const CAPTCHA_ENDPOINT = rawEndpoint ? `${rawEndpoint.replace(/\/+$/, '')}/` : ''

export const CAPTCHA_ENABLED = Boolean(CAPTCHA_ENDPOINT)

/** Mensaje cuando el reto no se pudo resolver (widget caído, red, bot detectado). */
export const CAPTCHA_FAILED_MSG = 'No se pudo completar la verificación anti-bot. Inténtalo de nuevo.'

/**
 * Adjunta el token al payload solo si el CAPTCHA está activo.
 * Con el CAPTCHA desactivado devuelve los mismos params sin tocar.
 */
export const withCaptcha = <T extends object>(params: T, capToken?: string | null) =>
    CAPTCHA_ENABLED && capToken ? { ...params, [CAPTCHA_FIELD]: capToken } : params
