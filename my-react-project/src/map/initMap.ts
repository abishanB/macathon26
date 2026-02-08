import maplibregl from "maplibre-gl";

const TORONTO_CENTER: [number, number] = [-79.385, 43.65];

export function initMap(container: HTMLDivElement): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: "https://demotiles.maplibre.org/style.json",
    center: TORONTO_CENTER,
    zoom: 12.8,
    pitch: 45,
    bearing: -12,
    antialias: true,
  });


  return map;
}
