import { createNotification } from '@modules/core/notifications.helper';

// Script de prueba del circuito de notificaciones.
// Uso: bun run src/utils/trigger-test-notification.ts <userId>
//
// NOTA: al correr como proceso independiente solo PERSISTE en BD (el mapa de
// sesiones WS vive en el proceso del servidor, así que aquí no hay push).
// Verifica el resultado abriendo la campana en el frontend. El push en tiempo
// real solo ocurre cuando createNotification() se llama desde el servidor.
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const userId = args[0] ? Number(args[0]) : null;

    if (!userId) {
        console.error('Por favor especifica un ID de usuario. Ejemplo: bun run src/utils/trigger-test-notification.ts 2');
        process.exit(1);
    }

    console.log(`Enviando notificación de prueba al usuario ID: ${userId}...`);

    const result = await createNotification({
        userId,
        title: 'Notificación de Prueba',
        message: '¡Funciona! Esta notificación se guardó en core.notifications.',
        type: 'info',
        module: 'core',
        link: '/profile',
    });

    if (result.error) {
        console.error('Error al enviar notificación:', result.error);
    } else {
        console.log('Notificación enviada y guardada:', result.result);
    }

    process.exit(result.error ? 1 : 0);
}

main();
