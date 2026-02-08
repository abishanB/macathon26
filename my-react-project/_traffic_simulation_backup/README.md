# Traffic Simulation Backup

This folder contains the complete traffic simulation implementation that was replaced during the MapLibre migration.

## What's Included

### Core Application Files
- **App.tsx** - Main React component with traffic simulation UI
- **App.css** - Styles for traffic simulation controls, heatmap legend, and stats display
- **package.json.traffic** - Dependencies for Mapbox GL-based implementation

### Map Utilities (`map/` folder)
- **initMap.ts** - Mapbox GL map initialization
- **layers.ts** - Road layer rendering and heatmap visualization

### Traffic Simulation Engine
- **dijkstra.ts** - Shortest path algorithm for routing
- **graph.ts** - Graph construction from GeoJSON road network
- **model.ts** - Traffic assignment, OD generation, reachability analysis
- **types.ts** - TypeScript type definitions
- **updateGeo.ts** - Apply traffic metrics to road features

## Key Features

### Traffic Simulation
- Graph-based road network from GeoJSON
- Origin-Destination (OD) pair generation
- Dijkstra shortest path routing
- Traffic flow assignment with capacity constraints
- Interactive road closure simulation
- Real-time traffic heatmap visualization
- Reachability probe for network resilience testing

### UI Components
- Controls panel with simulation stats
- "Recompute" and "Reset Closures" buttons
- Real-time metrics display:
  - Nodes and directed edges count
  - Number of trips and probe trips
  - Closed roads count
  - Computation runtime
  - Unreachable trips count
- Color-coded heatmap legend (green → yellow → orange → red)
- Interactive road clicking to toggle closures

## How to Re-integrate

### 1. Restore Dependencies

Add these to `package.json`:
```json
{
  "dependencies": {
    "@mapbox/mapbox-gl-geocoder": "^5.1.2",
    "dotenv": "^17.2.4"
  }
}
```

Note: You'll need to decide whether to use Mapbox GL or adapt to MapLibre GL.

### 2. Restore Traffic Module

Create `src/traffic/` folder with these files:
- dijkstra.ts
- graph.ts
- model.ts
- types.ts
- updateGeo.ts

### 3. Restore Map Utilities

Create `src/map/` folder with:
- initMap.ts (or adapt for MapLibre)
- layers.ts (or adapt for MapLibre)

### 4. Update App.tsx

Either:
- **Option A**: Replace current App.tsx with the traffic simulation version
- **Option B**: Create a separate route/page for traffic simulation
- **Option C**: Add tabs to switch between building editor and traffic sim

### 5. Add Data Files

Ensure you have:
- `public/data/roads_downtown.geojson` - Road network data

### 6. Environment Variables

Set up `.env` file with:
```
VITE_MAPBOX_TOKEN=your_mapbox_access_token
```

## Adapting to MapLibre GL

If you want to keep MapLibre instead of Mapbox:

1. **Map Initialization** - Update `initMap.ts` to use `maplibregl.Map`
2. **Layers** - Replace Mapbox-specific layer code with MapLibre equivalents
3. **Types** - Update imports from `mapbox-gl` to `maplibre-gl`
4. **Geocoder** - Find a MapLibre-compatible geocoder alternative

The traffic simulation logic itself (graph, dijkstra, model) is framework-agnostic and can work with either Mapbox or MapLibre.

## Architecture Notes

### Data Flow
1. Load GeoJSON road network → Parse & validate
2. Build graph structure → Nodes and edges
3. Generate OD pairs → Random origin-destination trips
4. Run traffic assignment → Shortest path routing
5. Apply metrics to features → Update road properties
6. Render heatmap → Color-coded by traffic flow

### Performance
- Handles ~1000+ road segments
- 200-300 OD trip assignments
- Sub-100ms recomputation on modern hardware
- Debounced updates (300ms) for interactive changes

## Files Extracted From

Git commit: `de25225` (before MapLibre migration)
Date: Before the "My MapLibre migration work" commit

## Next Steps

Choose your integration approach:
1. **Dual Mode**: Keep both building editor and traffic sim as separate modes
2. **Replace**: Go back to traffic simulation only
3. **Hybrid**: Show traffic sim on existing buildings/roads

---

*Backup created during merge conflict resolution to preserve traffic simulation functionality.*
