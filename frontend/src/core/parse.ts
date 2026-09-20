import type { InputNumberProps } from "antd"

export const nn = (n: number) => n < 10 ? `0${n}` : n

const capitals = {
    'á': 'a',
    'é': 'e',
    'í': 'i',
    'ó': 'o',
    'ú': 'u',
    'ü': 'u',
    'º': '°',
    'ª': '°',
    '°': '°',

}

export const normalize = (str) => {
    if (!str) return str
    if (typeof str !== 'string') return str
    // if(typeof str !== 'string') str = str.toString()
    // console.log(str)
    return str.trim().toLowerCase().replace(/[^a-z0-9°]/g, (c) => capitals[c] || c)
}

export const slugify = (text: string) => {
    return text.toString().toLowerCase().trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '')
}

export const capitalizeWords = (str: string) => {
    if (!str) return str;
    return str
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

export const getInitials = (name: string) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0].charAt(0) + (parts[1] ? parts[1].charAt(0) : '')).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
};


// 100 => 100.00, 100.1 => 100.10, 100.12 => 100.12

export const toFixed = (n: number) => {
    const [_, decimal] = n.toString().split('.')
    if (!decimal) return `${n}.00`
    if (decimal.length === 1) return `${n}0`
    return n
}

// 10000 => 10,000.00, 10000.1 => 10,000.10, 10000.12 => 10,000.12
export const toParseMoney = (num: number, placeholder = false) => {
    if (!num && placeholder) return '0.00'
    if (num === 0) return ''
    if (!num) return num
    // La firma dice `number`, pero la línea de abajo comprueba
    // `typeof num !== 'number'`: aquí llegan cadenas.
    // biome-ignore lint/suspicious/noGlobalIsNan: Number.isNaN('abc') es false e isNaN('abc') true; cambiarlo alteraría el resultado.
    if (isNaN(num)) return num
    if (typeof num !== 'number') num = Number(num)
    const formatter = new Intl.NumberFormat('es-PE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    // return formatter.format(num).replace(/,/g, ',').replace(/,/g, '\'');
    return `S/ ${formatter.format(num)}`;
}

export const formatterAntd: InputNumberProps<number>['formatter'] = (value) => {
    const [start, end] = `${value}`.split('.') || [];
    const v = `${start}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `S/ ${end ? `${v}.${end}` : `${v}`}`;
};

export const parserAntd: InputNumberProps<number>['parser'] = (value) => value?.replace(/S\/\s?|(,*)/g, '') as unknown as number

export const formatterNumber: InputNumberProps<number>['formatter'] = (value) => {
    const [start, end] = `${value}`.split('.') || [];
    const v = `${start}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${end ? `${v}.${end}` : `${v}`}`;
};

export const parserNumber: InputNumberProps<number>['parser'] = (value) => value?.replace(/(,*)/g, '') as unknown as number

export const generateListMap = <T extends { value: string }>(list: T[]) => {
    return {
        list,
        map: new Map(list.map((v) => [v.value, v])),
    }
}