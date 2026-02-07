# UrbanSim Hackathon — Changelog

## [0.3.0] - 2026-02-07 — RAG System + Toronto Document Ingestion

### Added

#### RAG Architecture (`src/lib/`, `src/rag/`, `scripts/`)
- **`src/lib/backboard.ts`** — Backboard.io client singleton
  - HTTP-based client matching Backboard SDK interface
  - Thread management (create, add context, chat, upload docs)
  - Singleton pattern with `getBackboardClient()`
  - Thread ID generator: `makeThreadId(bbox, userId)`
  - Pre-built `TORONTO_THREAD` config for Toronto construction focus

- **`src/rag/types.ts`** — TypeScript types for RAG system
  - `RagDocument`, `RagDocMetadata`, `ThreadConfig`
  - `RagQueryResult`, `UploadResult`, `IngestReport`

- **`src/rag/toronto-docs.ts`** — Toronto document extracts (7 documents)
  - CMP Fall 2024 (Congestion Management Plan update)
  - CMP 2023 Baseline
  - TIS Guidelines 2013 (Transportation Impact Study)
  - Traffic Disruption Management 2015
  - Noise Bylaw 2026
  - RoDARS & TTC Coordination
  - Zoning Bylaw Construction Highlights

#### Scripts (`scripts/`)
- **`scripts/ingest.ts`** — Upload all document extracts to Backboard
  - Creates thread, adds location context, uploads all docs
  - Full ingestion report with success/failure counts
  - Run: `npm run rag:ingest`

- **`scripts/test-rag.ts`** — Test RAG queries against Backboard
  - 8 pre-built Toronto construction test queries
  - Shows answers, sources, confidence scores
  - Run: `npm run rag:test`

- **`scripts/download-pdfs.ts`** — Download official Toronto PDFs
  - Downloads 4 PDFs to `public/docs/`
  - Skips already-downloaded files
  - Run: `npm run rag:download-pdfs`

#### PDF Sources (`public/docs/`)
- `cmp-fall-2024.pdf` — Congestion Management Plan Fall 2024 Update
- `cmp-2023-baseline.pdf` — CMP 2023 Baseline
- `tis-guidelines-2013.pdf` — Transportation Impact Study Guidelines
- `traffic-disruption-2015.pdf` — Managing Traffic Disruption

### npm Scripts Added
- `rag:ingest` — Upload document extracts to Backboard
- `rag:test` — Test RAG with sample queries
- `rag:download-pdfs` — Download Toronto municipal PDFs
- `rag:setup` — Full setup (download PDFs + ingest extracts)

### Dependencies Added
- `dotenv` — Environment variable loading for scripts
- `tsx` — TypeScript script runner

### Environment Variables Required
```
BACKBOARD_API_KEY=your_backboard_api_key_here
```

---

## [0.2.0] - 2026-02-07 — Search & Radius Control

### Added
- **Location Search** (`@mapbox/mapbox-gl-geocoder`)
  - Global address/city/region search in top-right
  - Autocomplete suggestions, marker placement
  - Flies map to selected location
  
- **Radius Control Widget** (`src/components/RadiusControl.tsx`)
  - View radius display (km × km)
  - Slider: 0.5–100 km range
  - Preset buttons: 1, 2, 5, 10, 20, 50 km
  - Dynamic updates on pan/zoom/search
  - Positioned right side, under search box

### Dependencies Added
- `@mapbox/mapbox-gl-geocoder` — Location search
- `@turf/turf` — Geospatial calculations

---

## [0.1.0] - 2026-02-07 — Initial Map Setup

### Added
- Mapbox GL JS v3 map with 3D buildings
- MapboxDraw polygon tool for building creation
- Fill-extrusion layer for user-drawn shapes
- Toronto as default center
- Vite + React + TypeScript project structure

### Dependencies
- `mapbox-gl` — Map rendering
- `@mapbox/mapbox-gl-draw` — Drawing tools
