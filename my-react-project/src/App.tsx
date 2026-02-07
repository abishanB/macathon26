"use client";
import { useRef, useEffect, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "./App.css";

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

    // Once style is loaded, add a small extruded cube in Toronto
    map.on('style.load', () => {
      // GeoJSON square around downtown Toronto (~-79.3832, 43.6532)
      const cubeGeoJSON = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { height: 80 },
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [-79.3852, 43.6522],
                [-79.3812, 43.6522],
                [-79.3812, 43.6542],
                [-79.3852, 43.6542],
                [-79.3852, 43.6522]
              ]]
            }
          }
        ]
      } as GeoJSON.FeatureCollection;

      if (!map.getSource('toronto-cube')) {
        map.addSource('toronto-cube', { type: 'geojson', data: cubeGeoJSON });
        map.addLayer({
          id: 'toronto-cube-layer',
          type: 'fill-extrusion',
          source: 'toronto-cube',
          paint: {
            'fill-extrusion-color': '#00db84',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.9
          }
        });
      }
    });

    return () => {
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
