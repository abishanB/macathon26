# Downtown Toronto Reactive Traffic Heatmap MVP

Fast planning-grade traffic proxy built with React + TypeScript + Vite + Mapbox GL JS.

## What it does

- Loads road lines from `public/data/roads_downtown.geojson`
- Builds a directed graph with snapped endpoints
- Generates synthetic OD demand weighted toward downtown core
- Runs a 2-iteration assignment with a BPR-style congestion function
- Colors roads by delay factor (`t / t0`)
- Toggles road closures by clicking road segments and recomputes in near real time

## Setup

1. Install dependencies:
   - `npm install`
2. Create env file:
   - copy `.env.example` to `.env`
   - set `VITE_MAPBOX_TOKEN=...`
3. Run:
   - `npm run dev`

## Scripts

- `npm run dev` starts the Vite app
- `npm run build` runs strict TypeScript build and production bundle
- `npm run lint` runs ESLint

## Data notes

- The app does not fetch roads at runtime.
- It reads local static data from `public/data/roads_downtown.geojson`.
- A synthetic grid seed file is included so the app works out of the box.

## Optional Overpass refresh workflow

1. Use query file: `scripts/overpass_downtown_toronto.query`
2. Optional helper: `scripts/fetch-overpass-roads.ps1`
3. In Overpass Turbo, run the query and export as GeoJSON.
4. Save export to `public/data/roads_downtown.geojson`.
