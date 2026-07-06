export const countWords = (text: string | undefined | null): number => {
    if (!text) return 0;
    // matches any sequence of non-whitespace characters
    const words = text.trim().match(/\S+/g);
    return words ? words.length : 0;
};
