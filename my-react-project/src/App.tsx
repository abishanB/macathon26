"use client";
import { useRef, useEffect, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "./App.css";
import { attachDraw } from './map/draw';

const INITIAL_CENTER: [number, number] = [-79.3662, 43.715];//long, lat - Toronto, Canada
const INITIAL_ZOOM: number = 10.35;
const PITCH: number = 45;
const BEARING: number = -17.6;  


export default function App() {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  //const [center, setCenter] = useState<[number, number]>(INITIAL_CENTER);//camera center


  
  useEffect(() => {
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

    const container = mapContainerRef.current;
    if (!container) return; // ensures it's not null
    
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
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <div id="map-container" ref={mapContainerRef} />

    </> 
  );
}
