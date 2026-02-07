"use client";
import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';

import 'mapbox-gl/dist/mapbox-gl.css';

const MapboxExample = () => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return; // Initialize map only once
    console.log('Initializing Mapbox map...');
    mapboxgl.accessToken = 'pk.eyJ1IjoiYWJpc2hhbmJoYXZhbmFudGhhbiIsImEiOiJjbWd4NWdpeW0xNjF1MmxwdWd1MG9wNDgwIn0.lxyzYElk6AX-ayD1IPC0XQ';

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current || 'map-container',
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [-74.0066, 40.7135],
      zoom: 15.5,
      pitch: 45,
      bearing: -17.6,
      antialias: true
    });

    if (!mapRef.current) return;

    mapRef.current.on('style.load', () => {
      const style = mapRef.current!.getStyle();
      const layers = style.layers ?? [];
      const labelLayer = layers.find(
        (layer) => layer.type === 'symbol' && layer.layout && (layer.layout as any)['text-field']
      );
      const labelLayerId = labelLayer ? labelLayer.id : undefined;

      mapRef.current!.addLayer(
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
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return <div id="map-container" ref={mapContainerRef} style={{ height: '100vh', width: '100%' }}></div>;
};

export default MapboxExample;