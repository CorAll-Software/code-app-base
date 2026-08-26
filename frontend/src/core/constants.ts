export const r2 = (n: number) => Math.round(n * 100) / 100

export const scrollbarWidth = () => {
    // thanks too https://davidwalsh.name/detect-scrollbar-width
    const scrollDiv = document.createElement('div')
    scrollDiv.setAttribute('style', 'width: 100px; height: 100px; overflow: scroll; position:absolute; top:-9999px;')
    document.body.appendChild(scrollDiv)
    const scrollbarWidth = scrollDiv.offsetWidth - scrollDiv.clientWidth
    document.body.removeChild(scrollDiv)
    return scrollbarWidth
}

/**
 * Claves de localStorage usadas en la aplicación.
 * Centraliza los literales de string para evitar typos.
 */
export const LOCAL_STORAGE_KEYS = {
    TOKEN: 'token',
} as const

/**
 * Configuración de paginación para tablas Ant Design.
 */
export const PAGINATION = {
    DEFAULT_PAGE_SIZE: 10,
    LARGE_PAGE_SIZE: 20,
} as const
