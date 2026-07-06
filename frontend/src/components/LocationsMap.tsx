import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';

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

// Centro por defecto: Perú (los puertos/procedencias son nacionales).
const DEFAULT_CENTER: [number, number] = [-9.19, -75.0152];
const DEFAULT_ZOOM = 5;

export interface MapPoint {
    id: number | string;
    lat: number;
    lng: number;
    label?: string;
}

// Ajusta la vista para encuadrar todos los puntos; corrige el tamaño al montar
// dentro de un modal (donde el contenedor arranca con tamaño 0).
function FitBounds({ points }: { points: MapPoint[] }) {
    const map = useMap();
    useEffect(() => {
        const t = setTimeout(() => {
            map.invalidateSize();
            if (points.length === 1) {
                map.setView([points[0].lat, points[0].lng], 13);
            } else if (points.length > 1) {
                const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng] as [number, number]));
                map.fitBounds(bounds, { padding: [40, 40] });
            }
        }, 200);
        return () => clearTimeout(t);
    }, [points, map]);
    return null;
}

interface LocationsMapProps {
    points: MapPoint[];
    height?: number | string;
}

export function LocationsMap({ points, height = 480 }: LocationsMapProps) {
    return (
        <MapContainer
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            style={{ height, width: '100%', borderRadius: 8 }}
            scrollWheelZoom
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds points={points} />
            {points.map(p => (
                <Marker key={p.id} position={[p.lat, p.lng]}>
                    {p.label && <Popup>{p.label}</Popup>}
                </Marker>
            ))}
        </MapContainer>
    );
}
