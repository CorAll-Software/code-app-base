import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';

// Fix del ícono por defecto de Leaflet: con bundlers (Vite) las rutas relativas a
// las imágenes se rompen. Se borra el resolver interno y se apunta a las imágenes
// servidas por CDN (coherente con que los tiles también vienen de internet).

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
const PICKED_ZOOM = 13;

interface LocationPickerProps {
    lat?: number | null;
    lng?: number | null;
    onChange?: (lat: number, lng: number) => void;
    height?: number | string;
    // Solo lectura: sin clic ni arrastre; muestra el marcador y permite hacer pan/zoom.
    readonly?: boolean;
}

// Captura clics en el mapa y fija la coordenada.
function ClickHandler({ onChange }: { onChange: (lat: number, lng: number) => void }) {
    useMapEvents({
        click: (e) => onChange(+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)),
    });
    return null;
}

// Recentra el mapa cuando la coordenada cambia desde fuera (ej. al abrir en edición)
// y corrige el tamaño del contenedor al montar dentro de un modal/drawer.
function MapSync({ lat, lng }: { lat?: number | null; lng?: number | null }) {
    const map = useMap();

    useEffect(() => {
        const t = setTimeout(() => map.invalidateSize(), 200);
        return () => clearTimeout(t);
    }, [map]);

    useEffect(() => {
        if (lat != null && lng != null) {
            map.setView([lat, lng], Math.max(map.getZoom(), PICKED_ZOOM));
        }
    }, [lat, lng, map]);

    return null;
}

export function LocationPicker({ lat, lng, onChange, height = 260, readonly = false }: LocationPickerProps) {
    const hasPoint = lat != null && lng != null;
    const editable = !readonly && !!onChange;

    return (
        <MapContainer
            center={hasPoint ? [lat!, lng!] : DEFAULT_CENTER}
            zoom={hasPoint ? PICKED_ZOOM : DEFAULT_ZOOM}
            style={{ height, width: '100%', borderRadius: 8 }}
            scrollWheelZoom
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {editable && <ClickHandler onChange={onChange!} />}
            <MapSync lat={lat} lng={lng} />
            {hasPoint && (
                <Marker
                    position={[lat!, lng!]}
                    draggable={editable}
                    eventHandlers={editable ? {
                        dragend: (e) => {
                            const { lat: dLat, lng: dLng } = e.target.getLatLng();
                            onChange!(+dLat.toFixed(6), +dLng.toFixed(6));
                        },
                    } : undefined}
                />
            )}
        </MapContainer>
    );
}
