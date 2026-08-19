import { useEffect, useImperativeHandle, useRef, type RefObject, type Ref } from 'react'
import { CAPTCHA_ENABLED, CAPTCHA_ENDPOINT } from '@core/captcha'

/*
    Widget de Cap (https://trycap.dev) en **modo flotante**.

    A diferencia del helper oficial `cap-floating.js` —que intercepta el click
    del botón en fase de captura y resuelve el reto ANTES de que corra ninguna
    validación— aquí el reto se dispara desde `solve()`, que se llama en el
    `onFinish` de Ant Design, es decir SOLO cuando el formulario ya validó.
    Así no se gasta una prueba-de-trabajo en un formulario con errores.

    Flujo: click → AntD valida → onFinish → solve() → el widget aparece sobre el
    botón y resuelve (~1-2 s) → se oculta → se envía la petición con el token.

    El elemento se crea de forma imperativa y vive en `document.body`: así el
    posicionamiento fijo no depende de contenedores con `overflow` o `position`.
*/

export interface CapCaptchaHandle {
    /**
     * Muestra el widget anclado al disparador y resuelve el reto.
     * Devuelve el token de un solo uso, o `''` si el CAPTCHA está desactivado.
     * Lanza si el reto no se pudo resolver.
     */
    solve: () => Promise<string>
}

interface CapCaptchaProps {
    ref?: Ref<CapCaptchaHandle>
    /** Elemento al que se ancla el widget (normalmente el botón de envío). */
    anchorRef: RefObject<any>
    /** Lado del anclaje; por defecto `top`, igual que el modo flotante oficial. */
    position?: 'top' | 'bottom'
    /** Separación en píxeles entre el widget y el disparador. */
    offset?: number
}

/** Margen mínimo respecto a los bordes de la ventana. */
const EDGE = 8

/** Tiempo que se deja visible el check de "verificado" antes de ocultar. */
const HOLD_MS = 450

export const CapCaptcha = ({ ref, anchorRef, position = 'top', offset = 8 }: CapCaptchaProps) => {

    const widgetRef = useRef<any>(null)
    // Promesa de carga: `solve()` puede llamarse antes de que el import termine.
    const readyRef = useRef<Promise<void> | null>(null)

    useEffect(() => {
        if (!CAPTCHA_ENABLED) return

        let cancelled = false

        readyRef.current = import('cap-widget')
            .then(() => {
                if (cancelled) return

                const widget = document.createElement('cap-widget') as any
                widget.setAttribute('data-cap-api-endpoint', CAPTCHA_ENDPOINT)
                // Cap trae sus propias traducciones, pero las elige según
                // `navigator.languages`, no según el <html lang>. Al fijarlo, la
                // UI del widget acompaña a la app aunque el navegador esté en
                // otro idioma.
                widget.setAttribute('data-cap-lang', 'es')
                widget.style.display = 'none'

                document.body.appendChild(widget)
                widgetRef.current = widget
            })

        return () => {
            cancelled = true
            widgetRef.current?.remove()
            widgetRef.current = null
            readyRef.current = null
        }
    }, [])

    /** Coloca el widget sobre (o bajo) el disparador y lo hace aparecer. */
    const show = (widget: HTMLElement) => {
        Object.assign(widget.style, {
            display: 'block',
            position: 'fixed',
            zIndex: '99999',
            opacity: '0',
            transform: 'scale(0.98)',
            marginTop: '-4px',
            boxShadow: 'rgba(0, 0, 0, 0.05) 0px 6px 24px 0px',
            borderRadius: '14px',
            transition: 'opacity 0.15s, margin-top 0.2s, transform 0.2s',
        })

        // Medir DESPUÉS de mostrarlo: oculto, offsetWidth/Height son 0.
        const anchor = anchorRef.current as HTMLElement | null
        if (anchor) {
            const rect = anchor.getBoundingClientRect()
            const { offsetWidth: w, offsetHeight: h } = widget

            const centered = rect.left + (rect.width - w) / 2
            widget.style.left = `${Math.max(EDGE, Math.min(centered, window.innerWidth - w - EDGE))}px`

            const top = position === 'top'
                ? rect.top - h - offset
                : rect.bottom + offset
            widget.style.top = `${Math.max(EDGE, Math.min(top, window.innerHeight - h - EDGE))}px`
        }

        // En el siguiente frame para que la transición se aplique.
        requestAnimationFrame(() => {
            widget.style.transform = 'scale(1)'
            widget.style.opacity = '1'
            widget.style.marginTop = '0'
        })
    }

    const hide = (widget: HTMLElement) => {
        widget.style.transform = 'scale(0.98)'
        widget.style.opacity = '0'
        widget.style.marginTop = '-4px'
        setTimeout(() => { widget.style.display = 'none' }, 200)
    }

    useImperativeHandle(ref, () => ({
        solve: async () => {
            if (!CAPTCHA_ENABLED) return ''

            await readyRef.current
            const widget = widgetRef.current
            if (!widget) throw new Error('El widget de verificación no está disponible')

            show(widget)
            try {
                // Estado limpio: fuerza un reto (y un token) nuevo en cada envío.
                widget.reset()

                // `solve()` lanza ante la mayoría de errores, pero devuelve
                // `undefined` si la instrumentación se bloquea/expira o si ya
                // había un reto en curso: sin token, no hay verificación.
                const result = await widget.solve()
                if (!result?.success || !result.token) {
                    throw new Error('No se pudo completar la verificación anti-bot')
                }

                await new Promise(resolve => setTimeout(resolve, HOLD_MS))
                return result.token as string
            } finally {
                hide(widget)
            }
        }
    }), [position, offset])

    // El widget vive en document.body; aquí no se renderiza nada.
    return null
}
