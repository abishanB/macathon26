# Database Setup Guide

## Prerequisites

1. **Supabase Project**: Create a project at [supabase.com](https://supabase.com)
2. **Environment Variables**: Add your Supabase credentials to `.env`

## Environment Variables

Add these to your `.env` file:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

### Where to Find Your Keys

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **API**
3. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon/public key** → `VITE_SUPABASE_ANON_KEY`
   - **service_role key** → `VITE_SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)

## Running Migrations

### Option 1: Supabase Dashboard (Recommended)

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. For each migration file (001 → 005):
   - Click **New Query**
   - Copy/paste the SQL from the migration file
   - Click **Run**
   - Verify success message

### Option 2: Supabase CLI

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Push migrations
supabase db push
```

### Option 3: psql (Direct Database Connection)

```bash
# Get connection string from Supabase Dashboard → Settings → Database
# Format: postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

psql "your-connection-string"

# Run migrations
\i database/migrations/001_enable_extensions.sql
\i database/migrations/002_create_projects_table.sql
\i database/migrations/003_create_buildings_table.sql
\i database/migrations/004_create_building_history_table.sql
\i database/migrations/005_create_helper_functions.sql
```

## Verify Installation

After running migrations, verify tables exist:

```sql
-- Check tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('projects', 'buildings', 'building_history')
ORDER BY table_name;

-- Check extensions
SELECT * FROM pg_extension WHERE extname IN ('postgis', 'uuid-ossp', 'pgcrypto');

-- Test helper function
SELECT decode_building_vector('W1stNzkuMzg1LCA0My42NV1d'); -- Should return coordinates
```

## Testing the Database

### Create a Test Project

```sql
INSERT INTO projects (name, location_name, session_id)
VALUES ('Test Project', 'Toronto, ON', 'test-session-123')
RETURNING id;
```

### Create a Test Building

```sql
INSERT INTO buildings (
  project_id,
  geometry,
  building_type,
  height,
  stories
)
VALUES (
  'your-project-id',
  'SRID=4326;POINT(-79.385 43.65)',
  'residential',
  40.0,
  12
)
RETURNING id, encoded_vector;
```

### Verify Vector Encoding

```sql
-- Check that vector was automatically encoded
SELECT 
  id,
  building_type,
  height,
  encoded_vector,
  decode_building_vector(encoded_vector) AS decoded_coords
FROM buildings
WHERE id = 'your-building-id';
```

## Troubleshooting

### PostGIS Not Available

If you get an error about PostGIS:
1. Contact Supabase support to enable PostGIS extension
2. Or modify migrations to use JSONB for geometry (less efficient)

### Migration Errors

- **Check order**: Run migrations in order (001 → 005)
- **Check dependencies**: Ensure extensions are enabled first
- **Check permissions**: Ensure you have CREATE TABLE permissions

### Vector Encoding Issues

- Verify `pgcrypto` extension is enabled
- Check that triggers are created correctly
- Test helper functions manually

## Next Steps

1. ✅ Run all migrations
2. ✅ Verify tables exist
3. ✅ Test helper functions
4. ✅ Update your `.env` with Supabase credentials
5. ✅ Start using `buildings-db.ts` functions in your app

## Usage in Code

```typescript
import { getOrCreateProject, saveBuilding, getBuildings } from './lib/buildings-db';

// Create/get project
const project = await getOrCreateProject('session-123', 'My Project', 'Toronto, ON');

// Save building
const building = await saveBuilding(project.id, {
  geometry: {
    type: 'Point',
    coordinates: [-79.385, 43.65]
  },
  buildingType: 'residential',
  height: 40,
  stories: 12
});

// Get all buildings
const buildings = await getBuildings(project.id);
```
