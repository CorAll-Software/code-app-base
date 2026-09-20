import { Button, Result, Typography } from 'antd';
import * as Sentry from '@sentry/react';
import type { ReactNode } from 'react';
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
 */

interface FallbackProps {
    error: unknown;
    eventId: string | null;
    resetError: () => void;
}

const Fallback = ({ error, eventId, resetError }: FallbackProps) => (
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
                <Button key='reintentar' onClick={resetError}>
                    Reintentar
                </Button>,
            ]}
        />
    </div>
);

export const AppErrorBoundary = ({ children }: { children: ReactNode }) => (
    <Sentry.ErrorBoundary
        fallback={({ error, eventId, resetError }) => (
            <Fallback error={error} eventId={eventId} resetError={resetError} />
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
