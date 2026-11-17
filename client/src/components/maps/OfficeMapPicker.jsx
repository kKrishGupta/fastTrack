import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { Crosshair, LocateFixed, MapPin, Search } from 'lucide-react';
import { divIcon } from 'leaflet';
import { Button } from '../ui/Button';

const INDIA_CENTER = [20.5937, 78.9629];
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const markerIcon = divIcon({
  className: 'office-map-marker',
  html: '<span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></span>',
  iconSize: [42, 48],
  iconAnchor: [21, 46],
});

const geocodeCache = new Map();
let geocodeQueue = Promise.resolve();
let lastGeocodeAt = 0;

function geocode(url) {
  if (geocodeCache.has(url)) return Promise.resolve(geocodeCache.get(url));
  const request = geocodeQueue.then(async () => {
    const waitMs = Math.max(0, 1100 - (Date.now() - lastGeocodeAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastGeocodeAt = Date.now();
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Map address service is temporarily unavailable');
    const data = await response.json();
    geocodeCache.set(url, data);
    return data;
  });
  geocodeQueue = request.catch(() => undefined);
  return request;
}

function MapEvents({ onPick }) {
  useMapEvents({ click: ({ latlng }) => onPick(latlng.lat, latlng.lng) });
  return null;
}

function MapController({ position, zoom }) {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();
      if (position) map.flyTo(position, zoom, { duration: 0.7 });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [map, position, zoom]);
  return null;
}

function coordinatesFrom(value) {
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && value.latitude !== '' && value.longitude !== ''
    ? [latitude, longitude]
    : null;
}

export function OfficeMapPicker({ value, onChange }) {
  const position = coordinatesFrom(value);
  const [query, setQuery] = useState(value.address || '');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('Click the map to place the office entrance.');
  const [searching, setSearching] = useState(false);
  const lookupId = useRef(0);

  const setLocation = async (latitude, longitude, knownAddress = '', options = {}) => {
    const lat = Number(latitude);
    const lng = Number(longitude);
    onChange({
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
      address: knownAddress || value.address,
    });
    if (!options.keepResults) setResults([]);
    if (knownAddress) {
      setQuery(knownAddress);
      setStatus('Location selected from the map search.');
      return;
    }

    const currentLookup = ++lookupId.current;
    setStatus('Finding the address for this point…');
    try {
      const params = new URLSearchParams({ format: 'jsonv2', lat: String(lat), lon: String(lng), zoom: '18', addressdetails: '1' });
      const data = await geocode(`https://nominatim.openstreetmap.org/reverse?${params}`);
      if (currentLookup !== lookupId.current) return;
      const address = data.display_name || '';
      onChange({ latitude: lat.toFixed(6), longitude: lng.toFixed(6), address });
      setQuery(address);
      setStatus(address ? 'Address and coordinates updated.' : 'Coordinates selected. Add an address if needed.');
    } catch (error) {
      if (currentLookup === lookupId.current) setStatus(error.message);
    }
  };

  const search = async () => {
    const searchText = query.trim();
    if (searchText.length < 3) {
      setStatus('Enter at least 3 characters to search.');
      return;
    }
    setSearching(true);
    setStatus('Searching the map…');
    try {
      const params = new URLSearchParams({ format: 'jsonv2', q: searchText, limit: '5', addressdetails: '1' });
      const data = await geocode(`https://nominatim.openstreetmap.org/search?${params}`);
      if (!data.length) {
        setResults([]);
        setStatus('No matching place found. Try a building name with city, state, or postcode.');
        return;
      }

      const [bestMatch] = data;
      setResults(data);
      await setLocation(bestMatch.lat, bestMatch.lon, bestMatch.display_name, { keepResults: true });
      setStatus(data.length > 1 ? 'Map moved to the best match. Choose another result below if needed.' : 'Map moved to the matching location.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSearching(false);
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setStatus('Location access is not supported by this browser.');
      return;
    }
    setStatus('Getting your current location…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setLocation(coords.latitude, coords.longitude),
      (error) => setStatus(error.code === 1 ? 'Location permission was denied.' : 'Your current location could not be determined.'),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  };

  const center = position || INDIA_CENTER;
  return (
    <div className="office-location-picker">
      <div className="map-search">
        <div className="map-search__field">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); search(); } }}
            placeholder="Search building, street, city, or postcode"
            aria-label="Search map"
          />
          <Button type="button" size="sm" onClick={search} disabled={searching}>{searching ? 'Searching…' : 'Search'}</Button>
        </div>
        <Button type="button" variant="secondary" onClick={useCurrentLocation}><LocateFixed size={16} />Use my location</Button>
      </div>

      {results.length > 0 && (
        <div className="map-search-results" role="listbox" aria-label="Map search results">
          {results.map((result) => (
            <button key={result.place_id} type="button" onClick={() => setLocation(result.lat, result.lon, result.display_name)}>
              <MapPin size={16} /><span>{result.display_name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="office-map-shell">
        <MapContainer center={center} zoom={position ? 17 : 5} scrollWheelZoom className="office-map-picker">
          <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
          <MapController position={position} zoom={17} />
          <MapEvents onPick={setLocation} />
          {position && (
            <>
              <Circle center={position} radius={Number(value.radiusMeters)} pathOptions={{ color: '#246249', fillColor: '#56a879', fillOpacity: 0.2, weight: 2 }} />
              <Marker
                position={position}
                icon={markerIcon}
                draggable
                eventHandlers={{ dragend: (event) => { const point = event.target.getLatLng(); setLocation(point.lat, point.lng); } }}
              />
            </>
          )}
        </MapContainer>
        <div className="map-instruction"><Crosshair size={15} />Click anywhere or drag the marker to refine the entrance</div>
      </div>

      <div className="map-selection" aria-live="polite">
        <div><span>Selected address</span><strong>{value.address || 'Choose a point on the map'}</strong></div>
        <div className="map-coordinate-pills">
          <span>Lat {position ? position[0].toFixed(6) : '—'}</span>
          <span>Lng {position ? position[1].toFixed(6) : '—'}</span>
          <span>{value.radiusMeters} m radius</span>
        </div>
        <small>{status}</small>
      </div>
    </div>
  );
}

export function OfficeMapPreview({ office }) {
  const position = useMemo(() => [office.location.coordinates[1], office.location.coordinates[0]], [office]);
  return (
    <div className="map-preview map-preview--live">
      <MapContainer center={position} zoom={16} dragging={false} scrollWheelZoom={false} doubleClickZoom={false} zoomControl={false} className="office-map-preview">
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
        <Circle center={position} radius={office.radiusMeters} pathOptions={{ color: '#246249', fillColor: '#56a879', fillOpacity: 0.24, weight: 2 }} />
        <Marker position={position} icon={markerIcon} interactive={false} />
      </MapContainer>
    </div>
  );
}
