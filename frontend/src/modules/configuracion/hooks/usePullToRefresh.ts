import { useRef, useCallback, useState, useEffect } from 'react';

interface UsePullToRefreshOptions {
    onRefresh: () => void | Promise<void>;
    threshold?: number;
    enabled?: boolean;
}

export const usePullToRefresh = ({ onRefresh, threshold = 80, enabled = true }: UsePullToRefreshOptions) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const startY = useRef(0);
    const currentY = useRef(0);
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleTouchStart = useCallback((e: TouchEvent) => {
        if (!enabled || isRefreshing) return;
        const el = containerRef.current;
        if (el && el.scrollTop === 0) {
            startY.current = e.touches[0].clientY;
        }
    }, [enabled, isRefreshing]);

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (!enabled || isRefreshing || !startY.current) return;
        const el = containerRef.current;
        if (el && el.scrollTop === 0) {
            currentY.current = e.touches[0].clientY;
            const diff = Math.max(0, currentY.current - startY.current);
            // Resistencia logarítmica para que se sienta natural
            const dampened = Math.min(diff * 0.4, threshold * 1.5);
            setPullDistance(dampened);
        }
    }, [enabled, isRefreshing, threshold]);

    const handleTouchEnd = useCallback(async () => {
        if (!enabled || isRefreshing) return;
        if (pullDistance >= threshold) {
            setIsRefreshing(true);
            try {
                await onRefresh();
            } finally {
                setIsRefreshing(false);
            }
        }
        startY.current = 0;
        currentY.current = 0;
        setPullDistance(0);
    }, [enabled, isRefreshing, pullDistance, threshold, onRefresh]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el || !enabled) return;

        el.addEventListener('touchstart', handleTouchStart, { passive: true });
        el.addEventListener('touchmove', handleTouchMove, { passive: true });
        el.addEventListener('touchend', handleTouchEnd);

        return () => {
            el.removeEventListener('touchstart', handleTouchStart);
            el.removeEventListener('touchmove', handleTouchMove);
            el.removeEventListener('touchend', handleTouchEnd);
        };
    }, [enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

    return { containerRef, pullDistance, isRefreshing };
};
