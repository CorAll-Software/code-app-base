import { useRef, useCallback, useState, useEffect } from 'react';

interface UsePullToRefreshOptions {
    onRefresh: () => unknown;
    threshold?: number;
    enabled?: boolean;
}

/** Distancia (ya amortiguada) a partir de la cual soltar dispara la recarga. */
export const PULL_THRESHOLD = 80;

/**
 * Resistencia progresiva: cuanto más se tira, menos sigue el indicador, sin
 * llegar nunca a un tope seco. `limite` es la asíntota.
 */
const rubberband = (distancia: number, limite: number, constante = 0.55) =>
    (distancia * limite * constante) / (limite + constante * distancia);

/**
 * El contenedor que de verdad hace scroll. En móvil la página fluye dentro del
 * layout principal, así que el `scrollTop` del propio elemento siempre vale 0
 * y no sirve para saber si se está arriba del todo.
 */
const scrollTopReal = (el: HTMLElement) => {
    const scroller = el.closest<HTMLElement>('.main-layout-container');
    return Math.max(el.scrollTop, scroller?.scrollTop ?? 0, window.scrollY);
};

export const usePullToRefresh = ({ onRefresh, threshold = PULL_THRESHOLD, enabled = true }: UsePullToRefreshOptions) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const startY = useRef(0);
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleTouchStart = useCallback((e: TouchEvent) => {
        if (!enabled || isRefreshing) return;
        const el = containerRef.current;
        startY.current = el && scrollTopReal(el) === 0 ? e.touches[0].clientY : 0;
    }, [enabled, isRefreshing]);

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (!enabled || isRefreshing || !startY.current) return;
        const el = containerRef.current;
        if (!el || scrollTopReal(el) !== 0) {
            // Empezó arriba pero ya se desplazó: deja de ser un tirón de recarga.
            startY.current = 0;
            setPullDistance(0);
            return;
        }
        const diff = Math.max(0, e.touches[0].clientY - startY.current);
        setPullDistance(rubberband(diff, threshold * 5));
    }, [enabled, isRefreshing, threshold]);

    const handleTouchEnd = useCallback(async () => {
        if (!enabled || isRefreshing) return;
        const disparar = pullDistance >= threshold;
        startY.current = 0;
        setPullDistance(0);
        if (!disparar) return;
        setIsRefreshing(true);
        try {
            await onRefresh();
        } finally {
            setIsRefreshing(false);
        }
    }, [enabled, isRefreshing, pullDistance, threshold, onRefresh]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el || !enabled) return;

        el.addEventListener('touchstart', handleTouchStart, { passive: true });
        el.addEventListener('touchmove', handleTouchMove, { passive: true });
        el.addEventListener('touchend', handleTouchEnd);
        el.addEventListener('touchcancel', handleTouchEnd);

        return () => {
            el.removeEventListener('touchstart', handleTouchStart);
            el.removeEventListener('touchmove', handleTouchMove);
            el.removeEventListener('touchend', handleTouchEnd);
            el.removeEventListener('touchcancel', handleTouchEnd);
        };
    }, [enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

    return { containerRef, pullDistance, isRefreshing };
};
