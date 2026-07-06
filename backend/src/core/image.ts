/**
 * Utilidades para procesamiento de imágenes
 * Convierte imágenes a formato WebP usando sharp
 */

import sharp from 'sharp';

/**
 * Convierte un buffer de imagen a formato WebP
 * @param buffer - Buffer de la imagen original
 * @param quality - Calidad del WebP (0-100, default 80)
 * @returns Buffer de la imagen en formato WebP
 */
export const convertToWebp = async (buffer: Buffer, quality: number = 80): Promise<Buffer> => {
    return await sharp(buffer)
        .webp({ quality })
        .toBuffer();
};

/**
 * Verifica si el archivo es una imagen válida
 * @param mimeType - Tipo MIME del archivo
 */
export const isValidImage = (mimeType: string): boolean => {
    const validTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/bmp',
        'image/tiff'
    ];
    return validTypes.includes(mimeType.toLowerCase());
};

/**
 * Obtiene la extensión del archivo desde el nombre
 */
export const getFileExtension = (filename: string): string => {
    return filename.split('.').pop()?.toLowerCase() || '';
};
