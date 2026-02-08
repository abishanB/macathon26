# Downtown Toronto Reactive Traffic + Building Impact App

Interactive planning-grade traffic simulation for downtown Toronto, with building placement and road-impact analysis.

Stack:
- React + TypeScript + Vite
- MapLibre GL (Mapbox style conversion helper included)
- Synthetic OD traffic assignment with Dijkstra routing
- Express backend for building/road spatial analysis

## Features

- Loads static road data from `public/data/roads_downtown.geojson`
- Builds a directed road graph from GeoJSON line features
- Runs synthetic traffic assignment and visualizes congestion as a heatmap
- Click-to-toggle road closures and recompute in near real time
- Shows closure stats, runtime, and unreachable trip probe count
- Supports building placement and analysis workflows via local API (`localhost:3001`)

## Repository Layout

- `src/` frontend app code (map, traffic model, UI components)
- `src/traffic/` graph build, OD generation, Dijkstra, assignment, metrics
- `src/map/` map/layer helpers and controls
- `public/data/roads_downtown.geojson` local road network input
- `server/` Express API for building storage and spatial analysis
- `scripts/` data ingest, conversion, and test utilities

## Prerequisites

- Node.js 20+ recommended
- npm 10+ recommended

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create environment file:

```bash
# macOS/Linux
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

3. Set required env values in `.env`:

- `VITE_MAPBOX_TOKEN` (recommended for Mapbox style/tiles)
- `VITE_BACKBOARD_API_KEY` (optional, only for impact-analysis assistant features)

Optional aliases supported in parts of the codebase:
- `VITE_MAPBOX_ACCESS_TOKEN`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_SERVICE_ROLE_KEY`

## Run Locally

Frontend only:

```bash
npm run dev
```

Backend API only:

```bash
npm run server
```

Frontend + backend together:

```bash
npm run dev:all
```

## Usage

1. Open the app in your browser after `npm run dev`.
2. Click road segments to toggle closures.
3. Use `Recompute` to force a fresh assignment run.
4. Use `Reset Closures` to restore baseline state.
5. Use building controls to add/analyze building footprints (requires backend server).

## Scripts

- `npm run dev` start Vite dev server
- `npm run server` start Express API on `http://localhost:3001`
- `npm run dev:all` run frontend and backend concurrently
- `npm run build` TypeScript build + production bundle
- `npm run preview` preview production build
- `npm run lint` run ESLint
- `npm run test:analysis` run backend analysis test script

## API Summary

Base URL: `http://localhost:3001`

- `GET /api/buildings`
- `POST /api/buildings`
- `GET /api/buildings/list`
- `DELETE /api/buildings/:id`
- `DELETE /api/buildings`
- `POST /api/buildings/analyze`
- `GET /api/buildings/analyze-all?radius=500`
- `POST /api/buildings/decode`
- `GET /api/roads/stats`
- `POST /api/roads/nearby`

See `server/README.md` for full request/response examples.

## Road Data Refresh (Optional)

This app does not fetch roads at runtime. It reads a local static file.

Current input:
- `public/data/roads_downtown.geojson`

To refresh from Overpass:

1. Query file: `scripts/overpass_downtown_toronto.query`
2. Fetch raw JSON:

```bash
powershell -ExecutionPolicy Bypass -File .\scripts\fetch-overpass-roads.ps1
```

3. Convert raw Overpass JSON to app GeoJSON:

```bash
node .\scripts\convert-overpass-to-geojson.mjs .\scripts\overpass_roads_raw.json .\public\data\roads_downtown.geojson
```

## Notes

- The traffic model is planning-grade and synthetic (not microscopic queue/signal simulation).
- Congestion is represented with a BPR-like travel-time function and small iterative assignment.
- Data quality and network connectivity depend on the current road extract.

## Additional Docs

- `QUICK_START.md`
- `ANALYSIS_SYSTEM.md`
- `BUILDING_SYSTEM.md`
- `BUILDING_IMPACT_ANALYSIS.md`
