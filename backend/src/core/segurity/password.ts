// Código para generar contraseñas aleatorias

export const generarContrasena = (longitud) => {
    const caracteres = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let contraseña = "";

    for (let i = 0; i < longitud; i++) {
        const indice = Math.floor(Math.random() * caracteres.length);
        contraseña += caracteres.charAt(indice);
    }

    return contraseña;
};

export const esFacilDeDecir = (contraseña) => {
    const consonantes = /[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]/;
    const vocales = /[aeiouAEIOU]/;

    return consonantes.test(contraseña) && vocales.test(contraseña);
};

export const generarContrasenaFacilDeDecir = (longitud) => {
    let contraseña = "";

    do {
        contraseña = generarContrasena(longitud);
    } while (!esFacilDeDecir(contraseña));

    return contraseña;
};