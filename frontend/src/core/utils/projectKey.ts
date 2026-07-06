export const generateProjectKey = (name: string, existingKeys: string[], currentKey?: string): string => {
    if (!name || name.trim().length === 0) return '';

    // 1. Limpiar y separar palabras
    const words = name.trim().split(/[\s-]+/).filter(word => word.length > 0);
    if (words.length === 0) return '';

    const firstWord = words[0];

    // 2. Obtener iniciales de todas las palabras despues de la primera
    const otherInitials = words.slice(1)
        .map(w => w[0])
        .filter(char => char && char.match(/[a-zA-Z0-9]/))
        .join('')
        .toUpperCase();

    const otherKeys = currentKey
        ? existingKeys.filter(k => k.toUpperCase() !== currentKey.toUpperCase())
        : existingKeys.map(k => k.toUpperCase());


    // Limita la key generada a 8 caracteres (base de datos soporta 50)
    const limit = (k: string) => k.substring(0, 8);

    // 3. Estrategia: Probar combinaciones hasta encontrar una libre
    // Primero intentamos solo iniciales: LIDS
    let key = limit((firstWord[0] + otherInitials).toUpperCase());
    if (!otherKeys.includes(key)) {
        return key;
    }

    // Si esta ocupada, probamos agregando letras de la primera palabra: LoIDS, LorIDS...
    for (let i = 2; i <= Math.min(firstWord.length, 4); i++) {
        const prefix = firstWord.substring(0, i);
        key = limit(prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase() + otherInitials);
        if (!otherKeys.includes(key.toUpperCase())) {
            return key;
        }
    }

    // 4. NUEVA ESTRATEGIA: Intentar con la última letra si hay colisión
    if (words.length > 1) {
        const lastWord = words[words.length - 1];
        
        // Iniciales + Última Letra de la Última Palabra: LIDS + T = LIDST
        if (lastWord.length > 1) {
            const lastChar = lastWord[lastWord.length - 1].toUpperCase();
            key = (limit((firstWord[0] + otherInitials).toUpperCase()) + lastChar).substring(0, 8);
            if (!otherKeys.includes(key.toUpperCase())) {
                return key;
            }

            // Iniciales + Segunda Letra de la Última Palabra: LIDS + I = LIDSI
            const secondChar = lastWord[1].toUpperCase();
            key = (limit((firstWord[0] + otherInitials).toUpperCase()) + secondChar).substring(0, 8);
            if (!otherKeys.includes(key.toUpperCase())) {
                return key;
            }
        }
    }

    // 5. Fallback extremo: Agregar numero secuencial
    let baseKey = limit((firstWord[0] + otherInitials).toUpperCase());
    let counter = 1;
    while (otherKeys.includes(`${baseKey}${counter}`.toUpperCase())) {
        counter++;
    }
    return `${baseKey}${counter}`;
};