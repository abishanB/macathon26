-- ============================================================================
-- Migration: 006_create_geometry_helper_function.sql
-- Description: Helper function to set building geometry from GeoJSON
-- Created: 2026-02-07
-- ============================================================================

-- Function to set building geometry from GeoJSON
-- This is needed because Supabase PostgREST doesn't directly accept PostGIS geometry
-- in insert/update operations - we use this RPC function instead
CREATE OR REPLACE FUNCTION set_building_geometry(
  building_id UUID,
  geojson TEXT
)
RETURNS VOID AS $$
DECLARE
  geom GEOMETRY;
BEGIN
  -- Convert GeoJSON to PostGIS geometry
  geom := ST_SetSRID(ST_GeomFromGeoJSON(geojson), 4326);
  
  -- Update the building
  UPDATE buildings
  SET geometry = geom
  WHERE id = building_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Building with id % not found', building_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users (or anon if using public access)
GRANT EXECUTE ON FUNCTION set_building_geometry(UUID, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION set_building_geometry IS 'Set building geometry from GeoJSON string. Used by Supabase RPC calls.';
