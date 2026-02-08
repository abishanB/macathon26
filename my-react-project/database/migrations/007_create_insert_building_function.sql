-- ============================================================================
-- Migration: 007_create_insert_building_function.sql
-- Description: Function to insert building with geometry conversion from GeoJSON
-- Created: 2026-02-07
-- ============================================================================

-- Function to insert a building with geometry from GeoJSON
-- This handles the geometry conversion that Supabase PostgREST can't do directly
CREATE OR REPLACE FUNCTION insert_building_with_geometry(
  p_project_id UUID,
  p_geojson TEXT,
  p_building_type VARCHAR,
  p_height NUMERIC,
  p_base_height NUMERIC DEFAULT 0,
  p_stories INTEGER DEFAULT NULL,
  p_footprint NUMERIC DEFAULT NULL,
  p_encoded_vector TEXT DEFAULT NULL,
  p_vector_format VARCHAR DEFAULT 'base64-json',
  p_construction_details JSONB DEFAULT '{}'::jsonb,
  p_impact_analysis JSONB DEFAULT NULL,
  p_status VARCHAR DEFAULT 'placed',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id UUID,
  project_id UUID,
  geometry GEOMETRY,
  building_type VARCHAR,
  height NUMERIC,
  base_height NUMERIC,
  stories INTEGER,
  footprint NUMERIC,
  encoded_vector TEXT,
  vector_format VARCHAR,
  construction_details JSONB,
  impact_analysis JSONB,
  status VARCHAR,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
DECLARE
  v_geom GEOMETRY;
  v_building_id UUID;
BEGIN
  -- Convert GeoJSON to PostGIS geometry
  v_geom := ST_SetSRID(ST_GeomFromGeoJSON(p_geojson), 4326);
  
  -- Insert building
  INSERT INTO buildings (
    project_id,
    geometry,
    building_type,
    height,
    base_height,
    stories,
    footprint,
    encoded_vector,
    vector_format,
    construction_details,
    impact_analysis,
    status,
    metadata
  ) VALUES (
    p_project_id,
    v_geom,
    p_building_type,
    p_height,
    p_base_height,
    p_stories,
    p_footprint,
    p_encoded_vector,
    p_vector_format,
    p_construction_details,
    p_impact_analysis,
    p_status,
    p_metadata
  )
  RETURNING buildings.id INTO v_building_id;
  
  -- Return the inserted building
  RETURN QUERY
  SELECT
    b.id,
    b.project_id,
    b.geometry,
    b.building_type,
    b.height,
    b.base_height,
    b.stories,
    b.footprint,
    b.encoded_vector,
    b.vector_format,
    b.construction_details,
    b.impact_analysis,
    b.status,
    b.metadata,
    b.created_at,
    b.updated_at
  FROM buildings b
  WHERE b.id = v_building_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION insert_building_with_geometry(
  UUID, TEXT, VARCHAR, NUMERIC, NUMERIC, INTEGER, NUMERIC, TEXT, VARCHAR, JSONB, JSONB, VARCHAR, JSONB
) TO anon, authenticated;

COMMENT ON FUNCTION insert_building_with_geometry IS 'Insert a building with geometry converted from GeoJSON. Used by Supabase RPC calls when PostgREST cannot handle PostGIS geometry directly.';
