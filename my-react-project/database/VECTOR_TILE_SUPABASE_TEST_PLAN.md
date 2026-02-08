# Vector Tile Encode/Decode + Local Storage (Now) + Supabase (Later) Test Plan

Last updated: 2026-02-08

## 1) Goal

When a user adds/updates/deletes a building, we want to:

1. Fetch the affected Mapbox vector tile(s).
2. Decode tile data.
3. Append/remove building feature(s) in the tile `building` layer (or dedicated custom layer).
4. Re-encode the tile.
5. Save the tile artifact to backend local disk storage.
6. Serve saved tiles back to MapLibre.

This document is a test plan for validating that pipeline end-to-end.

## 2) Current Baseline (From This Repo)

- `server/index.ts` currently proxies `/tiles/{z}/{x}/{y}.mvt` from Mapbox and returns the original buffer.
- `server/tile-utils.ts` can parse tile layers and build custom features but currently returns the original tile (encode path is not implemented).
- Custom building overlay data is currently in-memory and not persisted across server restarts.
- Supabase integration for building metadata/geometry already exists:
  - `src/lib/supabase.ts` (client + Base64 JSON helpers)
  - `src/lib/buildings-db.ts` (RPC insert/read/update/delete)
  - `database/migrations/001..007`

## 3) Scope of Testing

In scope:

- Binary MVT decode/encode correctness.
- Tile feature mutation correctness (add/update/delete).
- Local persistence (tile files + local metadata index).
- Map rendering correctness after reloading saved tiles.
- Performance and reliability under repeated edits.
- A Supabase-ready path is preserved as deferred scope (Phase 2).

Out of scope (for this phase):

- Global tile generation for all zoom levels.
- Non-building layer restyling.
- Long-term retention/archival policy.

## 4) Target Architecture Under Test

Recommended path:

1. Backend receives building edit event.
2. Backend computes impacted tile IDs (`z/x/y`) for active zoom bands.
3. For each impacted tile:
   - Fetch Mapbox tile.
   - Decompress if gzip.
   - Decode (`@mapbox/vector-tile` + `pbf`).
   - Append/remove building geometry (tile coordinates).
   - Encode tile (`@maplibre/vt-pbf` or `vt-pbf`).
   - Re-compress gzip.
   - Write to local path like `server/data/tile-overrides/{project_id}/{z}/{x}/{y}/{version}.mvt`.
4. Update local metadata index (JSON) with checksum/version/building IDs/timestamp.
5. Tile endpoint resolves to local override first, then falls back to Mapbox.

## 5) Local Storage Setup Tests

### 5.1 Preconditions

- Backend process has write access to `server/data/`.
- Directory exists (or is created on startup):
  - `server/data/tile-overrides/`
- Optional project-level subfolders are created lazily.

### 5.2 Local Metadata Objects to Test

Create local metadata file (recommended):

- `server/data/tile-overrides/index.json`
- Entry shape (recommended):
  - `project_id`
  - `z`, `x`, `y`
  - `version`
  - `storage_path`
  - `content_encoding` (`gzip`)
  - `content_type` (`application/vnd.mapbox-vector-tile`)
  - `checksum_sha256`
  - `building_ids`
  - `created_at`

### 5.3 File Persistence Tests

Test:

1. Write sample gzipped `.mvt` to local override path.
2. Read it back and verify byte-for-byte equality.
3. Verify `index.json` entry points to the same path and checksum.
4. Restart backend process and verify override still resolves.

## 6) Encoding/Decoding Method Tests

### 6.1 Decode

Use current dependencies:

- `@mapbox/vector-tile`
- `pbf`
- Node `zlib` (`gunzipSync` when response is gzip)

Assertions:

1. Tile parses with no exceptions.
2. Expected source layers exist.
3. Feature count is stable before mutation.

### 6.2 Encode

Add encoder dependency:

- Preferred: `@maplibre/vt-pbf` (actively maintained TypeScript fork)
- Alternative: `vt-pbf`

Assertions:

1. Re-encoded tile can be decoded again.
2. Appended building feature appears with expected properties (`id`, `height`, `type`).
3. Non-edited layers remain readable.

### 6.3 Geometry/Spec Correctness

Assertions:

1. Coordinates are transformed to tile extent correctly (default 4096 unless overridden).
2. Polygon rings are closed.
3. Geometry across tile boundaries is handled deterministically (clip/split strategy chosen and tested).
4. Render result in MapLibre has no flicker/seams at tile edges.

## 7) End-to-End Test Matrix

### 7.1 Functional

1. Add building -> affected tiles saved -> map refresh shows persisted building.
2. Update height/type -> tiles regenerated -> style reflects new properties.
3. Delete building -> building removed from overridden tiles after refresh.
4. Multiple buildings in same tile -> all preserved after each edit.
5. Building crossing tile boundary -> all impacted tiles updated.
6. Restart backend process -> overrides still served from local files.

### 7.2 Integrity

1. Decode -> encode -> decode round-trip preserves target layer features.
2. Checksum stored in local `index.json` matches saved tile bytes.
3. Metadata `z/x/y` matches request path.

### 7.3 Performance

1. Single-building edit latency target (define SLO, e.g. < 500 ms per impacted tile in dev).
2. Burst test: 20 rapid edits.
3. Memory growth remains bounded across repeated decode/encode.

### 7.4 Failure Handling

1. Local write failure -> fallback to Mapbox tile (no blank map).
2. Corrupt tile decode failure -> skip override + log structured error.
3. Partial multi-tile failure -> successful tiles remain available; failed tiles retried.

## 8) Concrete Test Cases

### TC-01: Local storage bootstrap

- Start server with empty `server/data/tile-overrides`.
- Expected: directory and index file are created without errors.

### TC-02: Binary tile write/read

- Write gzipped MVT file to local override path.
- Read and compare SHA-256.
- Expected: exact match.

### TC-03: Decode + append + encode

- Use a known `z/x/y` tile fixture.
- Append one polygon building.
- Re-encode and decode.
- Expected: added feature present with correct attrs and valid geometry.

### TC-04: Override resolution

- Request `/tiles/{z}/{x}/{y}.mvt` for a tile that has local override.
- Expected: response bytes match local override.
- Request a tile with no override.
- Expected: response falls back to Mapbox proxy.

### TC-05: Map render validation

- Configure map source to backend tile endpoint.
- Pan/zoom through edited area.
- Expected: no tile gaps, no console decode errors, consistent extrusion.

### TC-06: Refresh/restart persistence

- Add building and generate override tile.
- Refresh browser.
- Restart backend server.
- Refresh browser again.
- Expected: same building-visible result before and after restart.

## 9) Automation Plan

Add scripts:

1. `scripts/test-vector-tile-roundtrip.ts`
2. `scripts/test-local-tile-write-read.ts`
3. `scripts/test-tile-override-e2e.ts`

Run order in CI:

1. Unit round-trip tests.
2. Local file integration tests.
3. E2E tile override smoke tests.

## 10) Observability Requirements

Log structured events:

- `[TILE][FETCH] {z,x,y,source}`
- `[TILE][DECODE][OK|ERR]`
- `[TILE][MUTATE][ADD|UPDATE|DELETE] {buildingId}`
- `[TILE][ENCODE][OK|ERR]`
- `[TILE][LOCAL][WRITE][OK|ERR] {path}`
- `[TILE][LOCAL][READ][OK|ERR] {path}`
- `[TILE][LOCAL][INDEX][OK|ERR] {path}`
- `[TILE][SERVE][OVERRIDE|FALLBACK]`

Success metrics:

- Override hit ratio.
- Mean edit-to-visible latency.
- Local write failure rate.

## 11) Risks / Open Questions

1. Confirm policy/compliance implications of storing transformed Mapbox-derived tiles.
2. Decide clipping strategy for boundary-crossing polygons.
3. Decide versioning strategy (immutable path with version suffix vs overwrite same path).
4. Decide whether custom buildings should live in existing `building` layer or a dedicated custom layer.
5. Define cleanup policy for disk growth in `server/data/tile-overrides`.

## 12) References

Project-local:

- `my-react-project/server/index.ts`
- `my-react-project/server/tile-utils.ts`
- `my-react-project/src/lib/supabase.ts`
- `my-react-project/src/lib/buildings-db.ts`
- `my-react-project/database/migrations/003_create_buildings_table.sql`
- `my-react-project/database/migrations/005_create_helper_functions.sql`
- `my-react-project/database/migrations/007_create_insert_building_function.sql`

External:

- Mapbox Vector Tile spec: https://mapbox.github.io/vector-tile-spec/
- `@mapbox/vector-tile` README/API: https://github.com/mapbox/vector-tile-js
- `geojson-vt` (tile slicing): https://github.com/mapbox/geojson-vt
- `vt-pbf` package reference: https://www.npmjs.com/package/vt-pbf
- Supabase JS storage upload docs: https://supabase.com/docs/reference/javascript/storage-from-upload
- Supabase storage access control/RLS: https://supabase.com/docs/guides/storage/security/access-control
- Supabase standard upload behavior: https://supabase.com/docs/guides/storage/uploads/standard-uploads

## 13) Deferred Supabase Phase (Preserved for Later)

Keep this as the Phase 2 path once local storage is stable.

### 13.1 Preconditions

- `.env` has:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_SUPABASE_SERVICE_ROLE_KEY`
- Migrations `001..007` are applied.

### 13.2 Proposed New DB Objects

Add migration `008` for tile override metadata:

- `vector_tile_overrides` columns (recommended):
  - `id uuid pk`
  - `project_id uuid`
  - `z int`, `x int`, `y int`
  - `storage_path text`
  - `content_encoding text` (e.g. `gzip`)
  - `content_type text` (e.g. `application/vnd.mapbox-vector-tile`)
  - `checksum_sha256 text`
  - `building_ids jsonb`
  - `created_at timestamptz`

### 13.3 Storage Bucket Tests

Create bucket (example name): `vector-tiles`.

Test:

1. Upload sample `.mvt` via service-role client.
2. Read it back and verify byte-for-byte equality.
3. Verify metadata row points to the same path.

RLS expectations:

- Insert to `storage.objects` required for upload.
- `upsert: true` additionally requires `select` + `update`.
- Service role bypass path should be used only on trusted backend.
