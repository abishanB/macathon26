# Building Spatial Analysis Backend

A comprehensive backend system for analyzing building placement in relation to road networks, calculating traffic impacts, and providing spatial analysis capabilities.

## 🚀 Features

### 1. **Building-to-Road Analysis**
- Calculate distance from buildings to nearby roads
- Identify affected roads within a specified radius
- Find the closest road to any building placement

### 2. **Traffic Impact Estimation**
- Automatic impact level calculation (low/medium/high/severe)
- Based on proximity to roads and number of affected roads
- Identifies major roads (motorways, primary, secondary) separately

### 3. **Encoding & Decoding**
- Base64 encoding of building coordinates
- Efficient storage and transmission
- Full round-trip encoding/decoding support

### 4. **Spatial Queries**
- Find roads near any point
- Get road network statistics
- Calculate road lengths and distances

## 📡 API Endpoints

### Building Management

#### `GET /api/buildings`
Get all custom buildings as GeoJSON.

```bash
curl http://localhost:3001/api/buildings
```

#### `POST /api/buildings`
Add a new building.

```bash
curl -X POST http://localhost:3001/api/buildings \
  -H "Content-Type: application/json" \
  -d '{
    "coordinates": [
      [-79.3871, 43.6426],
      [-79.3869, 43.6426],
      [-79.3869, 43.6424],
      [-79.3871, 43.6424]
    ],
    "height": 45,
    "properties": {
      "name": "Custom Building",
      "type": "residential"
    }
  }'
```

#### `DELETE /api/buildings/:id`
Delete a specific building.

```bash
curl -X DELETE http://localhost:3001/api/buildings/custom-123
```

### Spatial Analysis

#### `POST /api/buildings/analyze`
Analyze a building's placement relative to the road network.

```bash
curl -X POST http://localhost:3001/api/buildings/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "buildingId": "test-001",
    "coordinates": [
      [-79.3871, 43.6426],
      [-79.3869, 43.6426],
      [-79.3869, 43.6424],
      [-79.3871, 43.6424]
    ],
    "radiusMeters": 500
  }'
```

**Response:**
```json
{
  "success": true,
  "analysis": {
    "buildingId": "test-001",
    "centroid": [-79.387, 43.6425],
    "bounds": {
      "minLng": -79.3871,
      "maxLng": -79.3869,
      "minLat": 43.6424,
      "maxLat": 43.6426
    },
    "nearbyRoads": [
      {
        "roadId": "way/123",
        "roadName": "Front Street West",
        "highway": "secondary",
        "distanceMeters": 45,
        "closestPoint": [-79.3870, 43.6425],
        "roadLength": 1250
      }
    ],
    "affectedArea": {
      "radiusMeters": 500,
      "roadsWithinRadius": 12,
      "estimatedTrafficImpact": "high"
    },
    "encoding": {
      "base64": "W1stNzkuMzg3MSwgNDMuNjQyNl0sIC4uLl0=",
      "byteSize": 128
    }
  },
  "summary": {
    "buildingId": "test-001",
    "centroid": [-79.387, 43.6425],
    "closestRoadDistance": 45,
    "closestRoadName": "Front Street West",
    "totalNearbyRoads": 12,
    "majorRoadsAffected": 3,
    "totalRoadLengthAffected": 8500,
    "impactLevel": "high",
    "encodingSize": 128
  }
}
```

#### `GET /api/buildings/analyze-all?radius=500`
Analyze all custom buildings at once.

```bash
curl http://localhost:3001/api/buildings/analyze-all?radius=500
```

#### `POST /api/roads/nearby`
Find roads near a specific point.

```bash
curl -X POST http://localhost:3001/api/roads/nearby \
  -H "Content-Type: application/json" \
  -d '{
    "lng": -79.3871,
    "lat": 43.6426,
    "radiusMeters": 500
  }'
```

### Road Network

#### `GET /api/roads/stats`
Get road network statistics.

```bash
curl http://localhost:3001/api/roads/stats
```

**Response:**
```json
{
  "totalRoads": 5432,
  "roadsByType": {
    "residential": 3200,
    "secondary": 850,
    "tertiary": 600,
    "primary": 400,
    "motorway": 120
  },
  "namedRoads": 2100
}
```

### Encoding/Decoding

#### `POST /api/buildings/decode`
Decode Base64-encoded building coordinates.

```bash
curl -X POST http://localhost:3001/api/buildings/decode \
  -H "Content-Type: application/json" \
  -d '{
    "encoded": "W1stNzkuMzg3MSwgNDMuNjQyNl0sIC4uLl0="
  }'
```

## 🧪 Testing

Run the comprehensive test suite:

```bash
# Start the server first
npm run server

# In another terminal, run tests
npx tsx scripts/test-analysis.ts
```

The test suite covers:
- Road network statistics
- Nearby road search
- Building placement analysis
- Encoding/decoding
- Full workflow (add + analyze + cleanup)

## 📊 Impact Levels

The system automatically calculates traffic impact based on:

| Level | Criteria |
|-------|----------|
| **Severe** | < 50m to closest road AND > 10 roads within radius |
| **High** | < 100m to closest road AND > 5 roads within radius |
| **Medium** | < 200m to closest road AND > 3 roads within radius |
| **Low** | All other cases |

## 🔧 Technical Details

### Distance Calculation
Uses Haversine formula for accurate geographic distance calculation:
- Earth radius: 6,371,000 meters
- Accounts for Earth's curvature
- Returns distances in meters

### Point-to-Line Distance
Calculates the shortest distance from a point to a line segment:
- Projects point onto line segment
- Handles line endpoints correctly
- Returns closest point on the line

### Road Length Calculation
Sums Haversine distances between consecutive road coordinates:
- Accurate for LineString geometries
- Returns total length in meters

### Encoding Format
Base64 encoding of JSON coordinate arrays:
```
Coordinates → JSON → UTF-8 bytes → Base64 string
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│          Frontend (React)               │
│  - Building placement UI                │
│  - Map visualization                    │
└─────────────┬───────────────────────────┘
              │
              │ HTTP/REST
              │
┌─────────────▼───────────────────────────┐
│      Backend Server (Express)           │
│  - Building storage                     │
│  - API endpoints                        │
└─────────────┬───────────────────────────┘
              │
              ├──> server/tile-utils.ts
              │    (Building storage)
              │
              ├──> server/analysis.ts
              │    (Spatial analysis engine)
              │
              └──> public/data/roads_downtown.geojson
                   (Road network data)
```

## 📝 Usage Example (TypeScript)

```typescript
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001';

async function analyzeBuilding() {
  const response = await fetch(`${API_BASE}/api/buildings/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      coordinates: [
        [-79.3871, 43.6426],
        [-79.3869, 43.6426],
        [-79.3869, 43.6424],
        [-79.3871, 43.6424]
      ],
      radiusMeters: 500
    })
  });

  const { analysis, summary } = await response.json();
  
  console.log(`Impact: ${summary.impactLevel}`);
  console.log(`Closest road: ${summary.closestRoadName} (${summary.closestRoadDistance}m)`);
  console.log(`Roads affected: ${summary.totalNearbyRoads}`);
}
```

## 🔮 Future Enhancements

- [ ] Database persistence (PostgreSQL/PostGIS)
- [ ] Real-time traffic data integration
- [ ] Historical impact analysis
- [ ] Construction timeline simulation
- [ ] Multi-building cumulative impact
- [ ] Export analysis reports (PDF/CSV)
- [ ] WebSocket support for live updates
- [ ] Caching layer for performance
- [ ] Authentication & authorization
- [ ] Rate limiting

## 🤝 Contributing

When adding new analysis features:

1. Add the logic to `server/analysis.ts`
2. Create API endpoint in `server/index.ts`
3. Add tests to `scripts/test-analysis.ts`
4. Update this README
5. Add TypeScript types

## 📄 License

MIT
