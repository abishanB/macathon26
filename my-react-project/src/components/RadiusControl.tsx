import { useEffect, useState, useRef } from "react";
import maplibregl from "maplibre-gl";
import * as turf from "@turf/turf";

interface RadiusControlProps {
  map: maplibregl.Map | null;
}

export const RadiusControl = ({ map }: RadiusControlProps) => {
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [isUpdating, setIsUpdating] = useState(false);
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate current radius from map bounds
  const calculateCurrentRadius = (): number => {
    if (!map) return 5;
    
    const bounds = map.getBounds();
    const center = map.getCenter();
    
    // Calculate distance from center to northeast corner
    const ne = bounds.getNorthEast();
    const centerPoint = turf.point([center.lng, center.lat]);
    const nePoint = turf.point([ne.lng, ne.lat]);
    const distance = turf.distance(centerPoint, nePoint, { units: 'kilometers' });
    
    return Math.round(distance * 10) / 10; // Round to 1 decimal
  };

  // Update map zoom based on radius
  const updateMapRadius = (newRadiusKm: number) => {
    if (!map || isUpdating) return;
    
    setIsUpdating(true);
    const center = map.getCenter();
    
    // Create a bounding box based on radius
    const centerPoint = turf.point([center.lng, center.lat]);
    const radiusMeters = newRadiusKm * 1000;
    
    // Create a circle and get its bbox
    const circle = turf.circle(centerPoint, radiusMeters, { units: 'meters', steps: 64 });
    const bbox = turf.bbox(circle);
    
    // Fit map to bbox
    map.fitBounds(
      [[bbox[0], bbox[1]], [bbox[2], bbox[3]]] as [maplibregl.LngLatLike, maplibregl.LngLatLike],
      {
        padding: 50,
        duration: 500,
        maxZoom: 18
      }
    );
    
    // Reset updating flag after animation
    setTimeout(() => setIsUpdating(false), 600);
  };

  // Update radius display when map moves (debounced)
  useEffect(() => {
    if (!map) return;

    const updateRadius = () => {
      // Don't update if we're currently programmatically updating the map
      // This prevents feedback loops when user adjusts the slider
      if (isUpdating) return;
      
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      updateTimeoutRef.current = setTimeout(() => {
        // Double-check we're not updating before setting radius
        // This ensures we don't update during programmatic map changes
        if (!isUpdating && map) {
          const currentRadius = calculateCurrentRadius();
          setRadiusKm(currentRadius);
        }
      }, 300);
    };

    // Listen to map movement events for dynamic updates
    // These fire when user pans/zooms or geocoder moves the map
    map.on('moveend', updateRadius);
    map.on('zoomend', updateRadius);

    // Initial calculation when map is ready
    const timeout = setTimeout(updateRadius, 100);

    return () => {
      map.off('moveend', updateRadius);
      map.off('zoomend', updateRadius);
      clearTimeout(timeout);
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [map]);

  const handleRadiusChange = (value: number) => {
    setRadiusKm(value);
    updateMapRadius(value);
  };

  const presetRadii = [1, 2, 5, 10, 20, 50];

  return (
    <div className="radius-control">
      <div className="radius-control-header">
        <label htmlFor="radius-slider">View Radius</label>
        <div className="radius-display">
          {radiusKm.toFixed(1)} km × {radiusKm.toFixed(1)} km
        </div>
      </div>
      
      <input
        id="radius-slider"
        type="range"
        min="0.5"
        max="100"
        step="0.5"
        value={radiusKm}
        onChange={(e) => handleRadiusChange(parseFloat(e.target.value))}
        className="radius-slider"
      />
      
      <div className="radius-presets">
        {presetRadii.map((preset) => (
          <button
            key={preset}
            onClick={() => handleRadiusChange(preset)}
            className={`radius-preset-btn ${Math.abs(radiusKm - preset) < 0.1 ? 'active' : ''}`}
          >
            {preset} km
          </button>
        ))}
      </div>
    </div>
  );
};
