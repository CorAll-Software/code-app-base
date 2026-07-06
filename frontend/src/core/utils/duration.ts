const HOURS_PER_DAY = 24

/**
 * Parse a YouTrack-style duration string into decimal hours.
 * Returns undefined if the string is empty or can't be parsed.
 */
export const parseDuration = (str?: string | null): number | undefined => {
    if (!str || !str.trim()) return undefined

    const d = str.match(/(\d+(?:\.\d+)?)\s*d/i)
    const h = str.match(/(\d+(?:\.\d+)?)\s*h/i)
    const m = str.match(/(\d+(?:\.\d+)?)\s*m/i)

    if (!d && !h && !m) {
        // Accept a bare number as hours (e.g. "4" → 4h)
        const bare = str.trim().match(/^(\d+(?:\.\d+)?)$/)
        if (bare) {
            const val = parseFloat(bare[1])
            return val > 0 ? Math.round(val * 100) / 100 : undefined
        }
        return undefined
    }

    let hours = 0
    if (d) hours += parseFloat(d[1]) * HOURS_PER_DAY
    if (h) hours += parseFloat(h[1])
    if (m) hours += parseFloat(m[1]) / 60

    const rounded = Math.round(hours * 100) / 100
    return rounded > 0 ? rounded : undefined
}

/**
 * Format decimal hours into a YouTrack-style duration string.
 * e.g.  20.5  →  "2d 4h 30m"
 *        1.5  →  "1h 30m"
 *        0.0  →  "0h"
 */
export const formatDuration = (hours?: number | null): string => {
    if (hours == null || hours <= 0) return '0h'

    const totalMins = Math.round(hours * 60)
    const d = Math.floor(totalMins / (HOURS_PER_DAY * 60))
    const remaining = totalMins % (HOURS_PER_DAY * 60)
    const h = Math.floor(remaining / 60)
    const mins = remaining % 60

    const parts: string[] = []
    if (d > 0) parts.push(`${d}d`)
    if (h > 0) parts.push(`${h}h`)
    if (mins > 0) parts.push(`${mins}m`)

    return parts.length > 0 ? parts.join(' ') : '0h'
}

/**
 * Validator for Ant Design Form rules.
 * Accepts strings like "2d 4h 30m", "1h", "45m", or empty.
 */
export const durationValidator = (_rule: unknown, value: string) => {
    if (!value || !value.trim()) return Promise.resolve()
    const result = parseDuration(value)
    if (result === undefined) {
        return Promise.reject('Formato inválido. Usa: "2d 4h 30m", "1h 30m", "45m"')
    }
    return Promise.resolve()
}