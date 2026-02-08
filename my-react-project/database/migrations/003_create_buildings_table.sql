-- ============================================================================
-- Migration: 003_create_buildings_table.sql
-- Description: Create buildings table with geometry, encoded vectors, and metadata
-- Created: 2026-02-07
-- ============================================================================

CREATE TABLE IF NOT EXISTS buildings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Building geometry (PostGIS)
  -- Supports Point, Polygon, MultiPolygon geometries
  geometry GEOMETRY NOT NULL, -- Can be POINT, POLYGON, or MULTIPOLYGON
  
  -- Building properties
  building_type VARCHAR(50) NOT NULL CHECK (building_type IN (
    'residential', 'commercial', 'mixed-use', 'industrial', 'institutional', 'polygon-building'
  )),
  height NUMERIC(10, 2) NOT NULL DEFAULT 0, -- meters
  base_height NUMERIC(10, 2) NOT NULL DEFAULT 0, -- meters (for extrusion base)
  stories INTEGER,
  footprint NUMERIC(10, 2), -- square meters
  
  -- Encoded vector representation
  -- Stores building coordinates/vertices in encoded format for efficient storage
  -- Format: Base64-encoded JSON array of coordinate pairs
  encoded_vector TEXT, -- Base64-encoded coordinate array
  vector_format VARCHAR(50) DEFAULT 'base64-json', -- Format identifier
  
  -- Construction details (stored as JSONB for flexibility)
  construction_details JSONB DEFAULT '{}'::jsonb,
  
  -- Impact analysis (from Backboard RAG)
  impact_analysis JSONB,
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN (
    'draft', 'placed', 'analyzed', 'approved', 'rejected'
  )),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ, -- Soft delete
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX idx_buildings_project_id ON buildings(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_buildings_geometry ON buildings USING GIST(geometry) WHERE deleted_at IS NULL;
CREATE INDEX idx_buildings_type ON buildings(building_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_buildings_status ON buildings(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_buildings_created_at ON buildings(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_buildings_construction_details ON buildings USING GIN(construction_details) WHERE deleted_at IS NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_buildings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_buildings_updated_at
  BEFORE UPDATE ON buildings
  FOR EACH ROW
  EXECUTE FUNCTION update_buildings_updated_at();

-- Function to automatically encode geometry to vector on insert/update
CREATE OR REPLACE FUNCTION encode_building_vector()
RETURNS TRIGGER AS $$
DECLARE
  geom_type TEXT;
  coords JSONB;
BEGIN
  -- Get geometry type
  geom_type := ST_GeometryType(NEW.geometry);
  
  -- Extract coordinates based on geometry type
  IF geom_type = 'ST_Point' THEN
    -- Point: [lng, lat]
    coords := jsonb_build_array(
      ST_X(NEW.geometry),
      ST_Y(NEW.geometry)
    );
  ELSIF geom_type = 'ST_Polygon' THEN
    -- Polygon: array of rings, each ring is array of [lng, lat] pairs
    SELECT jsonb_agg(
      jsonb_agg(
        jsonb_build_array(
          ST_X((dp).geom),
          ST_Y((dp).geom)
        )
      )
    )
    INTO coords
    FROM ST_DumpRings(NEW.geometry) AS ring
    CROSS JOIN LATERAL ST_DumpPoints(ring.geom) AS dp;
  ELSIF geom_type = 'ST_MultiPolygon' THEN
    -- MultiPolygon: array of polygons
    SELECT jsonb_agg(
      jsonb_agg(
        jsonb_agg(
          jsonb_build_array(
            ST_X((dp).geom),
            ST_Y((dp).geom)
          )
        )
      )
    )
    INTO coords
    FROM ST_Dump(NEW.geometry) AS poly
    CROSS JOIN LATERAL ST_DumpRings(poly.geom) AS ring
    CROSS JOIN LATERAL ST_DumpPoints(ring.geom) AS dp;
  END IF;
  
  -- Encode to Base64 JSON string
  IF coords IS NOT NULL THEN
    NEW.encoded_vector := encode(convert_to(coords::text, 'UTF8'), 'base64');
    NEW.vector_format := 'base64-json';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_encode_building_vector
  BEFORE INSERT OR UPDATE OF geometry ON buildings
  FOR EACH ROW
  EXECUTE FUNCTION encode_building_vector();

-- Comments
COMMENT ON TABLE buildings IS 'Buildings placed on the map with geometry, encoded vectors, and metadata';
COMMENT ON COLUMN buildings.geometry IS 'PostGIS geometry (Point, Polygon, or MultiPolygon) in WGS84';
COMMENT ON COLUMN buildings.encoded_vector IS 'Base64-encoded JSON array of coordinates for efficient storage/transmission';
COMMENT ON COLUMN buildings.vector_format IS 'Format identifier for the encoded vector (e.g., base64-json)';
COMMENT ON COLUMN buildings.construction_details IS 'Construction details stored as JSONB';
COMMENT ON COLUMN buildings.impact_analysis IS 'AI-generated impact analysis from Backboard RAG';
