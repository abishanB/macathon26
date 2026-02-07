"use client";
import { useRef, useEffect, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "./App.css";
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

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

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true }
    });
    map.addControl(draw, 'top-left');

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
    });

    // when user creates/updates/deletes shapes, copy Draw features to the geojson source
    const updateFromDraw = () => {
      const data = draw.getAll();
      // set a default height property for each polygon feature if missing
      data.features.forEach((f: any) => {
        if (!f.properties) f.properties = {};
        if (f.geometry?.type === 'Polygon' && f.properties.height == null) f.properties.height = 40;
      });
      if (map.getSource('user-shape')) {
        (map.getSource('user-shape') as mapboxgl.GeoJSONSource).setData(data);
      }
    };

    map.on('draw.create', updateFromDraw);
    map.on('draw.update', updateFromDraw);
    map.on('draw.delete', updateFromDraw);

    // cleanup
    return () => {
      map.off('draw.create', updateFromDraw);
      map.off('draw.update', updateFromDraw);
      map.off('draw.delete', updateFromDraw);
      map.removeControl(draw);
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
