"use client";
import { useRef, useEffect, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "./App.css";

const INITIAL_CENTER: [number, number] = [-79.3662, 43.715];//long, lat
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
      style: "mapbox://styles/mapbox/standard", // required
    
     
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      pitch: PITCH,
      bearing: BEARING,
      antialias: true
    
    });
    mapRef.current = map; // assign to ref once created

    if (!mapRef.current) return;
    


    return () => mapRef.current?.remove();
  }, []);

  return (
    <>
      <div id="map-container" ref={mapContainerRef} />

    </> 
  );
}
