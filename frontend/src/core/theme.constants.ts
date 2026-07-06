/**
 * Tokens de UI compartidos para bordes, fondos y superficies.
 * Usar cuando no hay acceso al hook useToken() de Ant Design.
 */
export const THEME = {
    /** Borde estándar gris claro — card dividers, table rows */
    border:        '1px solid #f0f0f0',
    /** Borde más prominente — e.g. header del Gantt */
    borderStrong:  '1px solid #e8e8e8',
    /** Fondo de superficie secundaria (inputs, filas alternas) */
    bgMuted:       '#fafafa',
    /** Fondo de elemento al hacer hover */
    bgHover:       '#f0f0f0',
    /** Fondo de grupo activo en Gantt */
    bgActiveFase:  '#f5f0ff',
    /** Fondo de badge/chip para roles de sistema */
    bgSystemRole:  '#f9f0ff',
} as const
