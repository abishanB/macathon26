import { useRef, useEffect } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder";
import "@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css";
import "./App.css";
import { attachDraw } from './map/draw';
import { RadiusControl } from './components/RadiusControl';

const INITIAL_CENTER: [number, number] = [-79.3662, 43.715];//long, lat - Toronto, Canada
const INITIAL_ZOOM: number = 10.35;
const PITCH: number = 45;
const BEARING: number = -17.6;  


export default function App() {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const geocoderRef = useRef<MapboxGeocoder | null>(null);


  
  useEffect(() => {
    const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    
    // Check if access token is set
    if (!accessToken) {
      console.error('❌ Mapbox access token is missing!');
      console.error('Please create a .env file in my-react-project/ with:');
      console.error('VITE_MAPBOX_ACCESS_TOKEN=your_token_here');
      alert('Mapbox access token is missing. Please check the console for instructions.');
      return;
    }

    mapboxgl.accessToken = accessToken;
    console.log('✅ Mapbox token loaded');

    const container = mapContainerRef.current;
    if (!container) {
      console.error('❌ Map container not found');
      return;
    }
    
    console.log('🗺️ Initializing map...');
    
    const map = new mapboxgl.Map({
      container: container,
      style: "mapbox://styles/mapbox/streets-v11",
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      pitch: PITCH,
      bearing: BEARING,
      antialias: true
    });

    mapRef.current = map; // assign to ref once created

    // Add error handlers
    map.on('error', (e) => {
      console.error('❌ Map error:', e.error);
      if (e.error?.message?.includes('token')) {
        alert('Invalid Mapbox token. Please check your .env file.');
      }
    });

    map.on('load', () => {
      console.log('✅ Map loaded successfully');
    });

    // Add Geocoder search control
    const geocoder = new MapboxGeocoder({
      accessToken: mapboxgl.accessToken,
      mapboxgl: mapboxgl,
      placeholder: "Search for places, addresses, cities...",
      marker: true, // Add a marker at the selected location
      countries: undefined, // Search globally
      proximity: {
        longitude: INITIAL_CENTER[0],
        latitude: INITIAL_CENTER[1]
      }, // Bias results towards initial location
      bbox: undefined, // Optional: limit search to a bounding box
      types: 'address,poi,neighborhood,locality,place,district,postcode,region,country', // Search all types
    });

    // Add geocoder to map (position it in top-right)
    map.addControl(geocoder, 'top-right');
    geocoderRef.current = geocoder;

    // Listen to geocoder results - this will trigger map movement and radius update
    geocoder.on('result', (e) => {
      const { result } = e;
      console.log('Search result:', result);
      // The map will automatically move to the result location
      // The radius control will update via its map event listeners
    });

    // Optional: Handle geocoder errors
    geocoder.on('error', (e) => {
      console.error('Geocoder error:', e.error);
    });

    const { draw, detach } = attachDraw(map);

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
    });

    // when user creates/updates/deletes shapes, copy Draw features to the geojson source
    // draw event handlers and control are attached inside `attachDraw`

    // cleanup
    return () => {
      // detach draw handlers and control
      try { detach(); } catch (e) {}
      if (geocoderRef.current && mapRef.current) {
        mapRef.current.removeControl(geocoderRef.current);
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <div id="map-container" ref={mapContainerRef} />
      <RadiusControl map={mapRef.current} />
    </> 
  );
}
