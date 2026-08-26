/**
 * Servicio de foto de perfil del usuario autenticado.
 *
 * STUB de la plantilla: para habilitarlo, expón un endpoint en el backend
 * (p. ej. `POST /auth/foto` / `DELETE /auth/foto`) y conéctalo aquí con
 * `POSTFormData` / `DELETE` de `@core/http`.
 */
// import { POSTFormData, DELETE } from '@core/http';

export const portalPhotoService = {
    uploadFoto: async (_file: File): Promise<{ foto_url?: string } | null> => {
        // TODO: const fd = new FormData(); fd.append('foto', _file);
        //       return POSTFormData('auth/foto', { params: fd });
        console.warn('[plantilla] portalPhotoService.uploadFoto no implementado');
        return null;
    },
    /** `false` = no se pudo eliminar; el llamador NO debe limpiar el avatar. */
    deleteFoto: async (): Promise<boolean> => {
        // TODO: return DELETE('auth/foto', {}).then(() => true).catch(() => false);
        console.warn('[plantilla] portalPhotoService.deleteFoto no implementado');
        return false;
    },
};
