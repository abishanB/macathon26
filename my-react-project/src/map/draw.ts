import maplibregl from "maplibre-gl";
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
//draw polygons 


export function attachDraw(map: maplibregl.Map) {
  const draw = new MapboxDraw({
    displayControlsDefault: false,
    controls: { polygon: true, trash: true }
  });


  const updateFromDraw = () => {
    const data = draw.getAll();
    data.features.forEach((f: any) => {
      if (!f.properties) f.properties = {};
      if (f.geometry?.type === 'Polygon' && f.properties.height == null) f.properties.height = 40;
    });
    if (map.getSource('user-shape')) {
      (map.getSource('user-shape') as maplibregl.GeoJSONSource).setData(data);
    }
  };

  map.on('draw.create', updateFromDraw);
  map.on('draw.update', updateFromDraw);
  map.on('draw.delete', updateFromDraw);

  return {
    draw,
    detach: () => {
      map.off('draw.create', updateFromDraw);
      map.off('draw.update', updateFromDraw);
      map.off('draw.delete', updateFromDraw);
      map.removeControl(draw);
    }
  };
}
