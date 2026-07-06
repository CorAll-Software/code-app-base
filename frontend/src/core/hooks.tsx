// hook para consumir servicios de listado

import { useEffect, useMemo, useState } from "react";
import { Grid } from "antd";

export const useCombo = <T extends { id: number }>(service: (search?: any) => Promise<T[]>) => {
    const [options, setOptions] = useState<T[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchOptions = async (search?: any) => {
        setLoading(true);
        const data = await service(search);
        setOptions(data || []);
        setLoading(false);
    };

    return { options, loading, fetchOptions };
}

const normalizeQuickFilterValue = (value?: string | number | null) => {
    return String(value || '').toLowerCase().trim();
}

export const useQuickMultiWordFilter = <T,>(
    rows: T[],
    query: string,
    getSearchValues: (row: T) => Array<string | number | null | undefined>
) => {
    const normalizedRows = useMemo(() => {
        return rows.map((row) => ({
            row,
            searchText: getSearchValues(row)
                .map(normalizeQuickFilterValue)
                .filter(Boolean)
                .join(' '),
        }));
    }, [rows, getSearchValues]);

    const queryTerms = useMemo(() => {
        return normalizeQuickFilterValue(query)
            .split(/\s+/)
            .filter(Boolean);
    }, [query]);

    return useMemo(() => {
        if (!queryTerms.length) return rows;

        return normalizedRows
            .filter((item) => queryTerms.every((term) => item.searchText.includes(term)))
            .map((item) => item.row);
    }, [rows, normalizedRows, queryTerms]);
}

export const useDebounce = <T,>(value: T, delay: number) => {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
}

export const useIsMobile = () => {
    const screens = Grid.useBreakpoint();
    return !screens.md;
}

export const useAutoHeight = (offset = 0) => {
    const [height, setHeight] = useState<number>(400); // Safe default
    const [ref, setRef] = useState<HTMLElement | null>(null);

    useEffect(() => {
        if (!ref) return;

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                // Subtract offset (headers/pagination) and ensure a minimum height
                setHeight(Math.max(200, entry.contentRect.height - (offset || 0)));
            }
        });

        observer.observe(ref);
        return () => observer.disconnect();
    }, [ref, offset]);

    return { setRef, height };
}