import { ClearOutlined, UndoOutlined } from '@ant-design/icons';
import { Button, Space, Tag, Typography } from 'antd';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { MapContainer, Marker, Polygon, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';

// Fix del ícono por defecto de Leaflet con bundlers (Vite). Idempotente.
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

const { Text } = Typography;

export type LatLng = [number, number];

// Centro por defecto: Perú.
const DEFAULT_CENTER: [number, number] = [-9.19, -75.0152];
const DEFAULT_ZOOM = 5;
const FIT_ZOOM = 17;

// Pequeño círculo arrastrable para cada vértice del polígono.
const vertexIcon = L.divIcon({
    className: 'polygon-vertex-marker',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    html: '<div style="width:14px;height:14px;border-radius:50%;background:#1677ff;border:2px solid #fff;box-shadow:0 0 3px rgba(0,0,0,.5);cursor:move"></div>',
});

interface PolygonPickerProps {
    value?: LatLng[] | null;
    onChange?: (poligono: LatLng[]) => void;
    height?: number | string;
    // Solo lectura: sin clic ni arrastre; muestra el polígono y permite pan/zoom.
    readonly?: boolean;
}

const round = (n: number) => +n.toFixed(6);

// Captura clics en el mapa para añadir vértices.
function ClickToAddVertex({ onAdd }: { onAdd: (p: LatLng) => void }) {
    useMapEvents({
        click: (e) => onAdd([round(e.latlng.lat), round(e.latlng.lng)]),
    });
    return null;
}

// Corrige el tamaño dentro de modales/drawers (donde el contenedor arranca en 0)
// y encuadra el polígono UNA sola vez, cuando aparecen los primeros vértices
// (cubre la edición, donde el valor se carga después del montaje). Tras el primer
// encuadre no vuelve a moverse para no estorbar la edición en vivo.
function FitPolygon({ points }: { points: LatLng[] }) {
    const map = useMap();
    const fitted = useRef(false);

    useEffect(() => {
        const t = setTimeout(() => map.invalidateSize(), 200);
        return () => clearTimeout(t);
    }, [map]);

    useEffect(() => {
        if (fitted.current || points.length === 0) return;
        fitted.current = true;
        const t = setTimeout(() => {
            if (points.length === 1) {
                map.setView(points[0], FIT_ZOOM);
            } else {
                map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: FIT_ZOOM });
            }
        }, 200);
        return () => clearTimeout(t);
    }, [points, map]);

    return null;
}

/**
 * Selector de polígono sobre un mapa Leaflet (OpenStreetMap).
 * - Clic en el mapa para añadir vértices (en orden).
 * - Arrastra un vértice para reubicarlo.
 * - "Deshacer" quita el último vértice; "Limpiar" elimina todos.
 * El valor es una lista de coordenadas [[lat,lng], ...]; un polígono válido
 * requiere al menos 3 vértices.
 */
export function PolygonPicker({ value, onChange, height = 320, readonly = false }: PolygonPickerProps) {
    const points: LatLng[] = Array.isArray(value) ? value : [];
    const editable = !readonly && !!onChange;

    const handleAdd = (p: LatLng) => onChange?.([...points, p]);
    const handleUndo = () => onChange?.(points.slice(0, -1));
    const handleClear = () => onChange?.([]);
    const handleDragVertex = (index: number, p: LatLng) =>
        onChange?.(points.map((pt, i) => (i === index ? p : pt)));

    const center = points.length > 0 ? points[0] : DEFAULT_CENTER;
    const isValid = points.length >= 3;

    return (
        <div>
            {editable && (
                <Space wrap style={{ marginBottom: 8 }}>
                    <Tag color={isValid ? 'success' : points.length > 0 ? 'warning' : 'default'}>
                        {points.length} vértice(s){!isValid && points.length > 0 ? ' (mín. 3)' : ''}
                    </Tag>
                    <Button size="small" icon={<UndoOutlined />} onClick={handleUndo} disabled={points.length === 0}>
                        Deshacer
                    </Button>
                    <Button size="small" danger icon={<ClearOutlined />} onClick={handleClear} disabled={points.length === 0}>
                        Limpiar
                    </Button>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        Haz clic en el mapa para trazar el contorno; arrastra un punto para ajustarlo.
                    </Text>
                </Space>
            )}

            <MapContainer
                center={center}
                zoom={points.length > 0 ? FIT_ZOOM : DEFAULT_ZOOM}
                style={{ height, width: '100%', borderRadius: 8 }}
                scrollWheelZoom
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitPolygon points={points} />
                {editable && <ClickToAddVertex onAdd={handleAdd} />}

                {points.length >= 3 ? (
                    <Polygon positions={points} pathOptions={{ color: '#1677ff', weight: 2, fillOpacity: 0.2 }} />
                ) : points.length === 2 ? (
                    <Polyline positions={points} pathOptions={{ color: '#1677ff', weight: 2, dashArray: '5,5' }} />
                ) : null}

                {editable &&
                    points.map((pt, i) => (
                        <Marker
                            key={i}
                            position={pt}
                            icon={vertexIcon}
                            draggable
                            eventHandlers={{
                                dragend: (e) => {
                                    const { lat, lng } = e.target.getLatLng();
                                    handleDragVertex(i, [round(lat), round(lng)]);
                                },
                            }}
                        />
                    ))}
            </MapContainer>
        </div>
    );
}
