import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

/**
 * Store genérico de "proyectos" hidratado desde el payload de login.
 *
 * Guarda la lista de "proyectos" (o cualquier alcance por entidad) a los que el
 * usuario tiene acceso. Queda vacío si el login no devuelve `proyectos`. Puede
 * reutilizarse para alcances por sede/área si el negocio lo requiere, o
 * eliminarse junto con su uso en `providers/auth-provider.tsx`.
 */
export interface Proyecto {
    id: number
    [key: string]: any
}

interface ProyectosState {
    proyectos: Proyecto[]
    initialized: boolean
    setProyectos: (list: Proyecto[]) => void
    reset: () => void
}

export const useProyectosStore = create<ProyectosState>()(
    devtools(
        (set) => ({
            proyectos: [],
            initialized: false,
            setProyectos: (list) =>
                set({ proyectos: list ?? [], initialized: true }, false, 'proyectos/set'),
            reset: () =>
                set({ proyectos: [], initialized: false }, false, 'proyectos/reset'),
        }),
        { name: 'ProyectosStore' }
    )
)
