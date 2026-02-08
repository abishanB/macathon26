-- ============================================================================
-- Migration: 005_create_helper_functions.sql
-- Description: Helper functions for encoding/decoding building vectors
-- Created: 2026-02-07
-- ============================================================================

-- ============================================================================
-- Function: decode_building_vector
-- Description: Decode a Base64-encoded vector back to coordinate array
-- Parameters:
--   encoded_vector TEXT - Base64-encoded JSON string
-- Returns: JSONB array of coordinates
-- ============================================================================
CREATE OR REPLACE FUNCTION decode_building_vector(encoded_vector TEXT)
RETURNS JSONB AS $$
DECLARE
  decoded_text TEXT;
  coords JSONB;
BEGIN
  IF encoded_vector IS NULL OR encoded_vector = '' THEN
    RETURN NULL;
  END IF;
  
  -- Decode from Base64
  decoded_text := convert_from(decode(encoded_vector, 'base64'), 'UTF8');
  
  -- Parse as JSONB
  coords := decoded_text::jsonb;
  
  RETURN coords;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to decode vector: %', SQLERRM;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- Function: encode_coordinates_to_vector
-- Description: Encode a coordinate array to Base64-encoded vector
-- Parameters:
--   coords JSONB - JSONB array of coordinates
-- Returns: TEXT (Base64-encoded string)
-- ============================================================================
CREATE OR REPLACE FUNCTION encode_coordinates_to_vector(coords JSONB)
RETURNS TEXT AS $$
DECLARE
  encoded_vector TEXT;
BEGIN
  IF coords IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Convert JSONB to text and encode to Base64
  encoded_vector := encode(convert_to(coords::text, 'UTF8'), 'base64');
  
  RETURN encoded_vector;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to encode vector: %', SQLERRM;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- Function: vector_to_geometry
-- Description: Reconstruct PostGIS geometry from encoded vector
-- Parameters:
--   encoded_vector TEXT - Base64-encoded coordinate array
--   geom_type TEXT - Geometry type ('Point', 'Polygon', 'MultiPolygon')
-- Returns: GEOMETRY
-- ============================================================================
CREATE OR REPLACE FUNCTION vector_to_geometry(encoded_vector TEXT, geom_type TEXT)
RETURNS GEOMETRY AS $$
DECLARE
  coords JSONB;
  geom GEOMETRY;
BEGIN
  -- Decode vector
  coords := decode_building_vector(encoded_vector);
  
  IF coords IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Reconstruct geometry based on type
  IF geom_type = 'Point' THEN
    -- Point: [lng, lat]
    geom := ST_SetSRID(
      ST_MakePoint(
        (coords->>0)::NUMERIC,
        (coords->>1)::NUMERIC
      ),
      4326
    );
  ELSIF geom_type = 'Polygon' THEN
    -- Polygon: array of rings, each ring is array of [lng, lat] pairs
    -- First element is outer ring
    geom := ST_SetSRID(
      ST_MakePolygon(
        ST_MakeLine(
          (
            SELECT array_agg(
              ST_MakePoint(
                (coord->>0)::NUMERIC,
                (coord->>1)::NUMERIC
              )
            )
            FROM jsonb_array_elements(coords->0) AS coord
          )
        )
      ),
      4326
    );
  ELSIF geom_type = 'MultiPolygon' THEN
    -- MultiPolygon: array of polygons
    SELECT ST_SetSRID(
      ST_Collect(
        (
          SELECT ST_MakePolygon(
            ST_MakeLine(
              (
                SELECT array_agg(
                  ST_MakePoint(
                    (coord->>0)::NUMERIC,
                    (coord->>1)::NUMERIC
                  )
                )
                FROM jsonb_array_elements(poly_ring) AS coord
              )
            )
          )
          FROM jsonb_array_elements(poly) AS poly_ring
        )
      ),
      4326
    )
    INTO geom
    FROM jsonb_array_elements(coords) AS poly;
  END IF;
  
  RETURN geom;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to reconstruct geometry: %', SQLERRM;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- Function: get_building_with_decoded_vector
-- Description: Get building with decoded vector for easy access
-- Parameters:
--   building_id UUID
-- Returns: TABLE with building data and decoded vector
-- ============================================================================
CREATE OR REPLACE FUNCTION get_building_with_decoded_vector(building_id UUID)
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
  decoded_vector JSONB,
  construction_details JSONB,
  impact_analysis JSONB,
  status VARCHAR,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
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
    decode_building_vector(b.encoded_vector) AS decoded_vector,
    b.construction_details,
    b.impact_analysis,
    b.status,
    b.metadata,
    b.created_at,
    b.updated_at
  FROM buildings b
  WHERE b.id = building_id
    AND b.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Comments
COMMENT ON FUNCTION decode_building_vector IS 'Decode Base64-encoded vector to JSONB coordinate array';
COMMENT ON FUNCTION encode_coordinates_to_vector IS 'Encode coordinate array to Base64-encoded vector string';
COMMENT ON FUNCTION vector_to_geometry IS 'Reconstruct PostGIS geometry from encoded vector';
COMMENT ON FUNCTION get_building_with_decoded_vector IS 'Get building with decoded vector for easy access';
