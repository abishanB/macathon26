# Traffic Simulation Integration Guide

## Quick Start: Add Traffic Simulation Back

### Option 1: Separate Route (Recommended)

Keep both features by creating separate pages:

1. **Install React Router** (if not already):
```bash
npm install react-router-dom
```

2. **Create new file** `src/pages/TrafficSimPage.tsx`:
   - Copy content from `_traffic_simulation_backup/App.tsx`
   - Rename component to `TrafficSimPage`

3. **Create new file** `src/pages/BuildingEditorPage.tsx`:
   - Move current App.tsx content here
   - Rename component to `BuildingEditorPage`

4. **Update** `src/App.tsx`:
```tsx
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import TrafficSimPage from './pages/TrafficSimPage';
import BuildingEditorPage from './pages/BuildingEditorPage';

export default function App() {
  return (
    <BrowserRouter>
      <nav>
        <Link to="/">Building Editor</Link>
        <Link to="/traffic">Traffic Simulation</Link>
      </nav>
      <Routes>
        <Route path="/" element={<BuildingEditorPage />} />
        <Route path="/traffic" element={<TrafficSimPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### Option 2: Tab Switcher

Add tabs to current page:

1. Add state for active tab
2. Render different content based on tab
3. Share the map instance or create separate ones

### Option 3: Replace Current (Not Recommended)

If you want traffic sim only:
- Replace `src/App.tsx` with backup version
- Restore `src/App.css` styles
- Update dependencies
- Adapt Mapbox code to MapLibre

## File Checklist

### Must Copy
- [ ] All files from `_traffic_simulation_backup/` to appropriate locations
- [ ] `dijkstra.ts`, `graph.ts`, `model.ts`, `types.ts`, `updateGeo.ts` → `src/traffic/`
- [ ] `map/initMap.ts`, `map/layers.ts` → `src/map/` (or adapt for MapLibre)
- [ ] Traffic simulation CSS → merge into `App.css`

### Dependencies to Add
```json
{
  "@mapbox/mapbox-gl-geocoder": "^5.1.2",
  "dotenv": "^17.2.4"
}
```

Or adapt to use MapLibre alternatives.

### Data Files Needed
- [ ] `public/data/roads_downtown.geojson` - Road network data

### Environment Variables
```env
VITE_MAPBOX_TOKEN=your_token_here
```

## MapLibre Adaptation

To keep MapLibre GL instead of Mapbox GL:

### 1. Update Imports
```tsx
// Before (Mapbox)
import type { Map, MapMouseEvent } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// After (MapLibre)
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
```

### 2. Update Map Initialization
```tsx
// In initMap.ts, replace mapboxgl with maplibregl
const map = new maplibregl.Map({
  container,
  style: convertedStyle, // Use your style converter
  center: [-79.3832, 43.6532],
  zoom: 13
});
```

### 3. Update Type Annotations
```tsx
// Change all Map types
const mapRef = useRef<maplibregl.Map | null>(null);

// Change event types
const handleMapClick = (event: maplibregl.MapMouseEvent) => {
  // ...
};
```

### 4. Replace Geocoder
Mapbox Geocoder won't work with MapLibre. Options:
- Use [maplibre-gl-geocoder](https://github.com/maplibre/maplibre-gl-geocoder)
- Use a custom geocoding solution (Nominatim, etc.)
- Remove geocoding feature temporarily

### 5. Layer Code
Good news: Most layer code is compatible! Just ensure:
- Source and layer IDs are consistent
- Paint properties use MapLibre-compatible syntax
- Data expressions work the same

## Testing

1. Start the app: `npm run dev`
2. Navigate to traffic simulation page/tab
3. Wait for road network to load
4. Click roads to toggle closures
5. Verify traffic heatmap updates
6. Check console for any errors

## Troubleshooting

### "Cannot find module 'mapbox-gl'"
- You need to either install mapbox-gl OR adapt code to MapLibre

### "Failed to load roads_downtown.geojson"
- Ensure file exists in `public/data/`
- Check file path in code matches actual location

### "Traffic not updating"
- Check browser console for errors
- Verify graph is building correctly
- Ensure OD pairs are generated

### Performance Issues
- Reduce number of OD pairs in `loadRoadNetwork`
- Increase debounce delay in `scheduleSimulation`
- Use smaller road network dataset

## Architecture Diagram

```
┌─────────────────────────────────────┐
│         App.tsx (Router)            │
├─────────────────┬───────────────────┤
│  Building Editor│  Traffic Sim      │
│  Page           │  Page             │
│                 │                   │
│  - MapLibre     │  - MapLibre/box   │
│  - Draw Tools   │  - Road Layers    │
│  - 3D Buildings │  - Graph Engine   │
│  - Custom Input │  - Traffic Model  │
└─────────────────┴───────────────────┘
       │                    │
       │                    │
       ▼                    ▼
  Building Backend    Road Network Data
  (Express/DB)        (GeoJSON)
```

## Next Steps

1. Choose your integration approach (Option 1, 2, or 3)
2. Follow the file checklist
3. Update dependencies
4. Adapt Mapbox → MapLibre (optional)
5. Test thoroughly
6. Consider merging both features into one powerful view!

---

*Need help? Check the README.md in this folder for more details about the traffic simulation architecture.*
