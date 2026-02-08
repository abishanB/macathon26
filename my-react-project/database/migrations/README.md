# Database Migrations

This directory contains SQL migration files for the UrbanSim Supabase database schema.

## Overview

The database stores buildings with their geometry, encoded vectors, construction details, and complete history for audit trails.

## Migration Files

### 001_enable_extensions.sql
Enables required PostgreSQL extensions:
- **PostGIS**: For geographic/geometric data storage
- **uuid-ossp**: For UUID generation
- **pgcrypto**: For cryptographic functions (encoding/decoding)

### 002_create_projects_table.sql
Creates the `projects` table to group buildings by session/project:
- Stores project metadata, location, bounding box
- Links to user/session identifiers
- Includes soft delete support

### 003_create_buildings_table.sql
Creates the `buildings` table with:
- **Geometry**: PostGIS geometry (Point, Polygon, MultiPolygon) in WGS84
- **Encoded Vector**: Base64-encoded JSON coordinate array for efficient storage
- **Construction Details**: JSONB for flexible construction metadata
- **Impact Analysis**: AI-generated analysis from Backboard RAG
- **Automatic Encoding**: Trigger automatically encodes geometry to vector on insert/update

### 004_create_building_history_table.sql
Creates the `building_history` table for complete audit trail:
- Stores full snapshots of building state at each version
- Tracks change type (created, updated, deleted, moved, resized, etc.)
- Automatically creates history entries via triggers
- Stores encoded vectors at each version for reconstruction

### 005_create_helper_functions.sql
Helper functions for vector encoding/decoding:
- `decode_building_vector()`: Decode Base64 vector to JSONB coordinates
- `encode_coordinates_to_vector()`: Encode coordinates to Base64 vector
- `vector_to_geometry()`: Reconstruct PostGIS geometry from encoded vector
- `get_building_with_decoded_vector()`: Get building with decoded vector

## Vector Encoding Format

Buildings are stored with encoded vectors for efficient storage and transmission:

### Format: `base64-json`

1. **Coordinates** are stored as JSON arrays:
   - Point: `[lng, lat]`
   - Polygon: `[[[lng, lat], ...], ...]` (array of rings)
   - MultiPolygon: `[[[[lng, lat], ...], ...], ...]` (array of polygons)

2. **Encoding**: JSON string → UTF-8 bytes → Base64 string

3. **Decoding**: Base64 string → UTF-8 bytes → JSON string → JSONB

### Example

```sql
-- Encode
SELECT encode_coordinates_to_vector('[[-79.385, 43.65], [-79.384, 43.65], [-79.384, 43.651]]'::jsonb);
-- Returns: Base64-encoded string

-- Decode
SELECT decode_building_vector('W1stNzkuMzg1LCA0My42NV0sIFstNzkuMzg0LCA0My42NV0sIFstNzkuMzg0LCA0My42NTFdXQ==');
-- Returns: JSONB array of coordinates
```

## Running Migrations

### Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Run each migration file in order (001 → 005)
4. Verify tables are created in **Table Editor**

### Using Supabase CLI

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

### Using psql

```bash
# Connect to your Supabase database
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"

# Run migrations
\i database/migrations/001_enable_extensions.sql
\i database/migrations/002_create_projects_table.sql
\i database/migrations/003_create_buildings_table.sql
\i database/migrations/004_create_building_history_table.sql
\i database/migrations/005_create_helper_functions.sql
```

## Schema Diagram

```
projects
├── id (UUID, PK)
├── name, description, location_name
├── bbox (GEOMETRY)
├── user_id, session_id
└── metadata (JSONB)

buildings
├── id (UUID, PK)
├── project_id (FK → projects.id)
├── geometry (GEOMETRY) ← PostGIS geometry
├── encoded_vector (TEXT) ← Base64-encoded coordinates
├── building_type, height, stories, footprint
├── construction_details (JSONB)
├── impact_analysis (JSONB)
└── metadata (JSONB)

building_history
├── id (UUID, PK)
├── building_id (FK → buildings.id)
├── version_number (INTEGER)
├── change_type (VARCHAR)
├── snapshot (JSONB) ← Full building state
├── encoded_vector (TEXT) ← Vector at this version
└── changed_fields (TEXT[])
```

## Usage Examples

### Insert a Building

```sql
-- Create project first
INSERT INTO projects (name, location_name, bbox, session_id)
VALUES (
  'Toronto Downtown',
  'Toronto, ON',
  ST_MakeEnvelope(-79.4, 43.6, -79.3, 43.7, 4326),
  'session-123'
)
RETURNING id;

-- Insert building (vector encoding happens automatically)
INSERT INTO buildings (project_id, geometry, building_type, height, stories)
VALUES (
  'project-uuid',
  ST_SetSRID(ST_MakePoint(-79.385, 43.65), 4326),
  'residential',
  40.0,
  12
)
RETURNING id, encoded_vector;
```

### Get Building with Decoded Vector

```sql
SELECT * FROM get_building_with_decoded_vector('building-uuid');
```

### Query Buildings by Location

```sql
-- Find buildings within bounding box
SELECT *
FROM buildings
WHERE ST_Within(geometry, ST_MakeEnvelope(-79.4, 43.6, -79.3, 43.7, 4326))
  AND deleted_at IS NULL;
```

### Get Building History

```sql
-- Get all versions of a building
SELECT version_number, change_type, changed_fields, created_at
FROM building_history
WHERE building_id = 'building-uuid'
ORDER BY version_number DESC;
```

## Notes

- **PostGIS**: All geometries use SRID 4326 (WGS84)
- **Soft Deletes**: Use `deleted_at IS NULL` in WHERE clauses
- **Automatic Encoding**: Vector encoding happens automatically via triggers
- **History**: All changes are automatically tracked in `building_history`
- **JSONB**: Use JSONB for flexible metadata storage

## Troubleshooting

### PostGIS Extension Not Available

If PostGIS is not available in your Supabase instance:
1. Contact Supabase support to enable PostGIS
2. Or use JSONB for geometry storage (less efficient)

### Vector Encoding Issues

If encoding/decoding fails:
- Check that `pgcrypto` extension is enabled
- Verify Base64 format is correct
- Use helper functions for encoding/decoding

### Migration Order

Always run migrations in order (001 → 005) as they have dependencies.
