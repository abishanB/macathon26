import mapboxgl from "mapbox-gl";

const TORONTO_CENTER: [number, number] = [-79.385, 43.65];

export function initMap(container: HTMLDivElement, token: string): mapboxgl.Map {
  mapboxgl.accessToken = token;

  const map = new mapboxgl.Map({
    container,
    style: "mapbox://styles/mapbox/streets-v12",
    center: TORONTO_CENTER,
    zoom: 12.8,
    pitch: 45,
    bearing: -12,
    antialias: true,
  });
  return map;
}
