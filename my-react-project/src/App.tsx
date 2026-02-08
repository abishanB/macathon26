"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";
import { attachDraw } from './map/draw';
import { fetchAndConvertMapboxStyle, type MapboxStyle } from './utils/mapbox-style-converter';
import { BuildingInput } from './components/BuildingInput';

const INITIAL_CENTER: [number, number] = [-79.3662, 43.715];//long, lat - Toronto, Canada
const INITIAL_ZOOM: number = 10.35;
const PITCH: number = 45;
const BEARING: number = -17.6;

// Toronto boundaries: [southwest, northeast] as [lng, lat]
const TORONTO_BOUNDS: [[number, number], [number, number]] = [
  [-79.6, 43.58],  // Southwest corner
  [-79.2, 43.85]   // Northeast corner
];
const MIN_ZOOM: number = 9;
const MAX_ZOOM: number = 18;  


export default function App() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [mapStyle, setMapStyle] = useState<MapboxStyle | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [cursorCoordinates, setCursorCoordinates] = useState<{ lng: number; lat: number } | null>(null);

  const refreshCustomBuildings = useCallback(async () => {
    if (!mapRef.current) return;

    try {
      // Fetch custom buildings from backend
      const response = await fetch('http://localhost:3001/api/buildings');
      const geojson = await response.json();

      const map = mapRef.current;

      // Update or create the custom buildings source
      if (map.getSource('custom-buildings')) {
        (map.getSource('custom-buildings') as maplibregl.GeoJSONSource).setData(geojson);
      } else {
        // Get layers to insert before labels
        const layers = map.getStyle().layers || [];
        const labelLayerId = layers.find(
          (layer) => layer.type === 'symbol' && layer.layout && layer.layout['text-field']
        )?.id;

        map.addSource('custom-buildings', {
          type: 'geojson',
          data: geojson
        });

        // Add 3D extrusion layer for custom buildings
        map.addLayer({
          id: 'custom-buildings-3d',
          type: 'fill-extrusion',
          source: 'custom-buildings',
          paint: {
            'fill-extrusion-color': '#aaa',  // Same grey as existing buildings
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.8  // Slightly more visible than default buildings
          }
        }, labelLayerId);  // Insert before labels

        // Remove the outline layer for a cleaner look matching existing buildings
      }
    } catch (err) {
      console.error('Error refreshing custom buildings:', err);
    }
  }, []);

  const handleBuildingAdded = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);


  
  useEffect(() => {
    const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    
    // Fetch and convert the Mapbox style to MapLibre format
    fetchAndConvertMapboxStyle('mapbox://styles/mapbox/streets-v11', accessToken)
      .then(style => setMapStyle(style))
      .catch(err => console.error('Failed to load map style:', err));
  }, []);

  useEffect(() => {
    if (!mapStyle) return; // Wait for style to load

    const container = mapContainerRef.current;
    if (!container) return; // ensures it's not null
    
    const map = new maplibregl.Map({
      container: container,
      style: mapStyle as any, // MapLibre StyleSpecification compatible
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      pitch: PITCH,
      bearing: BEARING,
      maxBounds: TORONTO_BOUNDS,  // Restrict panning to Toronto area
      minZoom: MIN_ZOOM,          // Prevent zooming out too far
      maxZoom: MAX_ZOOM           // Prevent zooming in too far
    });

    mapRef.current = map; // assign to ref once created

    const { draw: _draw, detach } = attachDraw(map);

    // ensure a source/layer to render extrusions from Draw features
    const ensureUserSourceAndLayer = () => {
      if (!map.getSource('user-shape')) {
        map.addSource('user-shape', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      }
      if (!map.getLayer('user-shape-extrude')) {
        map.addLayer({
          id: 'user-shape-extrude',
          type: 'fill-extrusion',
          source: 'user-shape',
          paint: {
            'fill-extrusion-color': '#ff7e5f',
            'fill-extrusion-height': ['coalesce', ['get', 'height'], 40],
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.8
          }
        });
      }
    };

    map.on('style.load', () => {
      ensureUserSourceAndLayer();
      
      // add city 3D buildings (insert before label symbols); lower minzoom so buildings are visible sooner
      const layers = map.getStyle().layers || [];
      const labelLayerId = layers.find(
        (layer) => layer.type === 'symbol' && layer.layout && layer.layout['text-field']
      )?.id;

      if (!map.getLayer('add-3d-buildings')) {
        map.addLayer(
        {
          id: 'add-3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 15,
          paint: {
            'fill-extrusion-color': '#aaa',
            'fill-extrusion-height': [
              'interpolate',
              ['linear'],
              ['zoom'],
              15,
              0,
              15.05,
              ['get', 'height']
            ],
            'fill-extrusion-base': [
              'interpolate',
              ['linear'],
              ['zoom'],
              15,
              0,
              15.05,
              ['get', 'min_height']
            ],
            'fill-extrusion-opacity': 0.6
          }
        },
        labelLayerId
      );
      }

      // Load custom buildings after style is loaded
      refreshCustomBuildings();
    });

    // Track mouse movement for coordinate display
    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      setCursorCoordinates({
        lng: parseFloat(e.lngLat.lng.toFixed(6)),
        lat: parseFloat(e.lngLat.lat.toFixed(6))
      });
    };

    const handleMouseLeave = () => {
      setCursorCoordinates(null);
    };

    map.on('mousemove', handleMouseMove);
    map.on('mouseleave', handleMouseLeave);

    // when user creates/updates/deletes shapes, copy Draw features to the geojson source
    // draw event handlers and control are attached inside `attachDraw`

    // cleanup
    return () => {
      // detach draw handlers and control
      try { detach(); } catch (e) {}
      if (map) {
        map.off('mousemove', handleMouseMove);
        map.off('mouseleave', handleMouseLeave);
        map.remove();
      }
      mapRef.current = null;
    };
  }, [mapStyle, refreshCustomBuildings]);

  // Refresh custom buildings when trigger changes
  useEffect(() => {
    if (refreshTrigger > 0) {
      refreshCustomBuildings();
    }
  }, [refreshTrigger, refreshCustomBuildings]);

  return (
    <>
      <div id="map-container" ref={mapContainerRef} />
      <BuildingInput onBuildingAdded={handleBuildingAdded} />
      {cursorCoordinates && (
        <div className="coordinate-display">
          <div className="coordinate-label">Coordinates</div>
          <div className="coordinate-value">
            <span className="coord-lng">{cursorCoordinates.lng.toFixed(6)}</span>
            <span className="coord-separator">, </span>
            <span className="coord-lat">{cursorCoordinates.lat.toFixed(6)}</span>
          </div>
        </div>
      )}
    </> 
  );
}
