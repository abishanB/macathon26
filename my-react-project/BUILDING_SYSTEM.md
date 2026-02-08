# Custom Building System

This system allows you to add custom buildings to the map by entering coordinates through a web interface.

## How It Works

1. **Backend Tile Server** (`server/index.ts`)
   - Runs on `http://localhost:3001`
   - Proxies Mapbox vector tiles
   - Stores custom buildings in memory
   - Provides API endpoints for adding/clearing buildings

2. **Frontend UI** (`src/components/BuildingInput.tsx`)
   - Input form for building coordinates
   - Validates coordinates are within Toronto bounds
   - Sends building data to backend
   - Triggers map refresh

3. **Map Display** (`src/App.tsx`)
   - MapLibre renders base map with Mapbox tiles
   - Custom buildings displayed as GeoJSON layer
   - 3D extrusion with orange color (#ff6b35)

## Running the System

### Start both servers:
```bash
npm run dev:all
```

Or run separately:
```bash
# Terminal 1 - Frontend
npm run dev

# Terminal 2 - Backend
npm run server
```

## Using the System

1. Open `http://localhost:5174` (or whatever port Vite assigns)
2. You'll see a form on the right side of the map
3. Enter building coordinates in the format:
   ```
   -79.3871,43.6426
   -79.3869,43.6426
   -79.3869,43.6424
   -79.3871,43.6424
   ```
4. Set the building height (default 20 meters)
5. Click "Add Building"
6. The custom building will appear on the map in orange!

## Coordinate Format

- **Format**: `longitude,latitude` (one pair per line)
- **Minimum**: 3 coordinate pairs (forms a triangle)
- **Bounds**: Must be within Toronto area
  - Longitude: -79.6 to -79.2
  - Latitude: 43.58 to 43.85

## Example Buildings

### Small building near CN Tower:
```
-79.3871,43.6426
-79.3869,43.6426
-79.3869,43.6424
-79.3871,43.6424
```

### Larger building in downtown:
```
-79.3800,43.6500
-79.3795,43.6500
-79.3795,43.6495
-79.3800,43.6495
```

## API Endpoints

### Add Building
```
POST http://localhost:3001/api/buildings
Content-Type: application/json

{
  "coordinates": [[lng, lat], [lng, lat], ...],
  "height": 20,
  "properties": { "name": "Custom Building" }
}
```

### Get All Buildings
```
GET http://localhost:3001/api/buildings
```

### Clear All Buildings
```
DELETE http://localhost:3001/api/buildings
```

## Technical Details

- **Tile Storage**: In-memory (buildings lost on server restart)
- **Map Library**: MapLibre GL JS
- **Base Tiles**: Mapbox Vector Tiles (via proxy)
- **Custom Buildings**: GeoJSON overlay layer
- **3D Rendering**: fill-extrusion layer type

## Future Enhancements

- Persist buildings to database
- Actually modify vector tiles (currently using overlay)
- Export/import building data
- Edit existing buildings
- Building properties (name, type, etc.)
