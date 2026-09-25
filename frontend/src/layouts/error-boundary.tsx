import { Button, Result, Typography } from 'antd';
import * as Sentry from '@sentry/react';
import { useEffect, useState, type ReactNode } from 'react';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';
import { sentryActivo } from '@core/sentry';

const { Paragraph, Text } = Typography;

/**
 * Última red antes de la pantalla en blanco.
 *
 * Hasta ahora no había ninguna: un error de render dejaba el árbol vacío y sin
 * rastro. Esto captura ese caso, lo reporta (si el reporte está activo) y le
 * da al usuario algo que hacer.
 *
 * Deliberadamente NO atrapa errores de API: esos los maneja `core/http.ts`, que
 * los muestra con un toast y deja la pantalla en pie. Un ErrorBoundary solo ve
 * lo que revienta durante el render.
 *
 * Un despliegue nuevo invalida los chunks del anterior, así que el fallo más
 * común aquí es un `lazy()` que ya no existe. Por eso el botón principal
 * recarga: arregla ese caso de verdad.
 *
 * Hay DOS puertas y las dos hacen falta:
 *   · `AppErrorBoundary` — envuelve al RouterProvider. Cubre lo que revienta
 *     fuera del enrutado (proveedores, tema, el propio router al montarse).
 *   · `RouteErrorBoundary` — se registra como `errorElement`. Cubre lo que
 *     revienta DENTRO de una ruta, que es casi todo. Ver su comentario.
 */

interface FallbackProps {
    error: unknown;
    eventId: string | null;
    /** Acción secundaria: reintentar el render, o salir de la ruta rota. */
    secundario: { texto: string; onClick: () => void };
}

const Fallback = ({ error, eventId, secundario }: FallbackProps) => (
    <div className='flex-center'>
        <Result
            status='error'
            title='Algo se rompió en esta pantalla'
            subTitle={
                <>
                    <Paragraph type='secondary' style={{ marginBottom: 4 }}>
                        Si acaba de publicarse una versión nueva, recargar suele bastar.
                    </Paragraph>
                    {eventId && sentryActivo() && (
                        <Paragraph type='secondary' style={{ fontSize: 12, marginBottom: 0 }}>
                            Código para soporte: <Text code copyable>{eventId}</Text>
                        </Paragraph>
                    )}
                    {window._isDevelopment && (
                        <Paragraph type='danger' style={{ fontSize: 12, marginTop: 12, textAlign: 'left' }}>
                            <Text code>{error instanceof Error ? error.message : String(error)}</Text>
                        </Paragraph>
                    )}
                </>
            }
            extra={[
                <Button type='primary' key='recargar' onClick={() => window.location.reload()}>
                    Recargar la página
                </Button>,
                <Button key='secundario' onClick={secundario.onClick}>
                    {secundario.texto}
                </Button>,
            ]}
        />
    </div>
);

/** Errores de fuera del enrutado. Dentro de una ruta no llega nada aquí: el
 *  data router los atrapa antes. Para eso está `RouteErrorBoundary`. */
export const AppErrorBoundary = ({ children }: { children: ReactNode }) => (
    <Sentry.ErrorBoundary
        fallback={({ error, eventId, resetError }) => (
            <Fallback
                error={error}
                eventId={eventId}
                secundario={{ texto: 'Reintentar', onClick: resetError }}
            />
        )}
        beforeCapture={(scope) => {
            scope.setTag('capa', 'render');
            // La ruta importa más que el componente para saber dónde mirar.
            scope.setTag('ruta', window.location.pathname);
        }}
    >
        {children}
    </Sentry.ErrorBoundary>
);

/**
 * Pantalla de fallo de una ruta. Se registra como `errorElement`.
 *
 * Hace falta porque el data router de React Router **no deja salir** los
 * errores de una ruta: los atrapa él, los guarda en su estado y los pinta con
 * su propia pantalla de depuración ("Unexpected Application Error!"). No los
 * relanza, así que no llegaban ni a `AppErrorBoundary` ni a `window.onerror`
 * ni, por tanto, a Sentry.
 *
 * Y eso se comía justo el caso más común: el `lazy()` de un chunk que ya no
 * existe tras un despliegue ocurre DENTRO de la ruta.
 *
 * Va colgado de cada ruta hija (no solo de la raíz) para que el layout siga en
 * pie y el usuario pueda irse a otra pantalla: navegar limpia el error.
 */
export const RouteErrorBoundary = () => {
    const error = useRouteError();
    const navigate = useNavigate();
    const [eventId, setEventId] = useState<string | null>(null);

    // Una respuesta del propio enrutado (un 403 lanzado por un loader, un 404)
    // es la aplicación funcionando, no un defecto: se enseña, no se reporta.
    const esRespuestaDeRuta = isRouteErrorResponse(error);

    useEffect(() => {
        if (esRespuestaDeRuta) return;
        // Los chunks caídos tras un despliegue ya están en `ignoreErrors`
        // (`core/sentry.ts`), así que se filtran solos y no ensucian nada.
        setEventId(Sentry.captureException(error, {
            tags: { capa: 'ruta', ruta: window.location.pathname },
        }));
    }, [error, esRespuestaDeRuta]);

    return (
        <Fallback
            error={error}
            eventId={eventId}
            secundario={{ texto: 'Ir al inicio', onClick: () => navigate('/') }}
        />
    );
};
