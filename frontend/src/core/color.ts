export const BRAND = {
    primary: '#251f5b',      // Azul índigo profundo — color principal de marca (personalizar por proyecto)
    secondary: '#44ab52',    // Verde de marca (acento / uso secundario)
    header: '#251f5b',       // Header en índigo de marca
    sider: '#1a1644',        // Sider en índigo muy oscuro (contraste)
    body: '#F2F2F2',         // Fondo gris claro
    layout: '#f5f7fa',       // Fondo de páginas/dashboards
    text: '#1a1644',         // Casi negro índigo
    textSecondary: '#595959',
    gradient: 'linear-gradient(135deg, #251f5b 0%, #44ab52 100%)',
    gradientLight: 'linear-gradient(130deg, #44ab52 0%, #251f5b 100%)'
}

/**
 * Paleta semántica Tailwind-compatible.
 * Centraliza los colores usados para tipos de fase, asset, reporte, etc.
 */
export const SEMANTIC_COLORS = {
    purple:   '#7c3aed',
    blue:     '#2563eb',
    cyan:     '#0891b2',
    green:    '#059669',
    greenAlt: '#16a34a',
    amber:    '#d97706',
    red:      '#dc2626',
    gray:     '#6b7280',
    indigo:   '#4f46e5',
    teal:     '#0d9488',
    orange:   '#ea580c',
    pink:     '#db2777',
    lime:     '#65a30d',
    slate:    '#64748b',
} as const

export const COLOR_PICKER_PALETTE = [
    SEMANTIC_COLORS.purple,
    SEMANTIC_COLORS.blue,
    SEMANTIC_COLORS.cyan,
    SEMANTIC_COLORS.green,
    SEMANTIC_COLORS.lime,
    SEMANTIC_COLORS.amber,
    SEMANTIC_COLORS.red,
    SEMANTIC_COLORS.pink,
    SEMANTIC_COLORS.indigo,
    SEMANTIC_COLORS.teal,
    SEMANTIC_COLORS.orange,
    SEMANTIC_COLORS.slate,
] as const

/**
 * Tokens semánticos de Ant Design v5.
 */
export const ANT_COLORS = {
    textDescription: '#8c8c8c',
    primary:         '#1677ff',
    warning:         '#faad14',
    success:         '#52c41a',
    error:           '#ff4d4f',
    errorAlt:        '#f5222d',
    warningAlt:      '#fa8c16',
} as const

export const COLORS_LIST = [
    '#251f5b', // Índigo de marca (principal)
    '#1677ff', // Azul Ant
    '#52c41a', // Verde Ant
    '#faad14', // Oro Ant
    '#f5222d', // Rojo Ant
    '#13c2c2', // Cian Ant
    '#722ed1', // Púrpura Ant
    '#eb2f96', // Magenta Ant
    '#fa8c16', // Naranja Ant
    '#2f54eb', // Geekblue Ant
    '#a0d911', // Lima Ant
    '#fa541c', // Volcano Ant
    '#b37feb', // Purple light
    '#ff85c0', // Pink light
    '#ffc069', // Orange light
    '#5cdbd3', // Cyan light
    '#ff4d4f', // Red vibrant
]

export const getColors = (nro: number) => {
    if (nro >= COLORS_LIST.length) nro = nro % COLORS_LIST.length
    return COLORS_LIST[nro]
}

export const getColorString = (str: string) => {
    if (!str) return COLORS_LIST[0];
    const normalized = str.trim().toLowerCase();
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
        hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % COLORS_LIST.length;
    return COLORS_LIST[index];
}

export const getColorStringHash = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = '#' + ((hash >> 24) & 0xFF).toString(16).padStart(2, '0') +
        ((hash >> 16) & 0xFF).toString(16).padStart(2, '0') +
        ((hash >> 8) & 0xFF).toString(16).padStart(2, '0');
    return color;
}

export const getColorsTag = (nro: number) => {
    const colors = ['magenta', 'purple', 'red', 'volcano', 'orange', 'gold', 'lime', 'green', 'cyan', 'blue', 'geekblue']
    if (nro >= colors.length) nro = nro % colors.length
    return colors[nro]
}

export const normalizeHex7 = (hex: string): string => {
    if (!hex) return hex
    if (hex.startsWith('#') && hex.length > 7) {
        return hex.substring(0, 7)
    }
    return hex
}
