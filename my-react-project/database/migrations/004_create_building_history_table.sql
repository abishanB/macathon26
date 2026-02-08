-- ============================================================================
-- Migration: 004_create_building_history_table.sql
-- Description: Create building history/versions table for audit trail
-- Created: 2026-02-07
-- ============================================================================

CREATE TABLE IF NOT EXISTS building_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  
  -- Version info
  version_number INTEGER NOT NULL,
  change_type VARCHAR(50) NOT NULL CHECK (change_type IN (
    'created', 'updated', 'deleted', 'moved', 'resized', 'height_changed', 'metadata_changed'
  )),
  
  -- Snapshot of building state at this version
  -- Store full building data as JSONB for complete history
  snapshot JSONB NOT NULL,
  
  -- Encoded vector at this version
  encoded_vector TEXT,
  
  -- Change details
  changed_fields TEXT[], -- Array of field names that changed
  change_reason TEXT,
  
  -- User/session info
  user_id UUID,
  session_id VARCHAR(255),
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_building_history_building_id ON building_history(building_id);
CREATE INDEX idx_building_history_version ON building_history(building_id, version_number DESC);
CREATE INDEX idx_building_history_change_type ON building_history(change_type);
CREATE INDEX idx_building_history_created_at ON building_history(created_at DESC);
CREATE INDEX idx_building_history_snapshot ON building_history USING GIN(snapshot);

-- Function to automatically create history entry on building changes
CREATE OR REPLACE FUNCTION create_building_history()
RETURNS TRIGGER AS $$
DECLARE
  next_version INTEGER;
  building_snapshot JSONB;
BEGIN
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO next_version
  FROM building_history
  WHERE building_id = NEW.id;
  
  -- Create snapshot of current building state
  building_snapshot := jsonb_build_object(
    'id', NEW.id,
    'project_id', NEW.project_id,
    'building_type', NEW.building_type,
    'height', NEW.height,
    'base_height', NEW.base_height,
    'stories', NEW.stories,
    'footprint', NEW.footprint,
    'geometry', ST_AsGeoJSON(NEW.geometry)::jsonb,
    'encoded_vector', NEW.encoded_vector,
    'construction_details', NEW.construction_details,
    'impact_analysis', NEW.impact_analysis,
    'status', NEW.status,
    'metadata', NEW.metadata,
    'created_at', NEW.created_at,
    'updated_at', NEW.updated_at
  );
  
  -- Determine change type
  DECLARE
    change_type_val VARCHAR(50);
    changed_fields_val TEXT[];
  BEGIN
    IF TG_OP = 'INSERT' THEN
      change_type_val := 'created';
      changed_fields_val := ARRAY[]::TEXT[];
    ELSIF TG_OP = 'UPDATE' THEN
      -- Determine what changed
      changed_fields_val := ARRAY[]::TEXT[];
      IF OLD.geometry IS DISTINCT FROM NEW.geometry THEN
        changed_fields_val := array_append(changed_fields_val, 'geometry');
        IF ST_AsText(OLD.geometry) != ST_AsText(NEW.geometry) THEN
          IF ST_GeometryType(OLD.geometry) = 'ST_Point' AND ST_GeometryType(NEW.geometry) = 'ST_Point' THEN
            change_type_val := 'moved';
          ELSE
            change_type_val := 'resized';
          END IF;
        END IF;
      END IF;
      IF OLD.height IS DISTINCT FROM NEW.height THEN
        changed_fields_val := array_append(changed_fields_val, 'height');
        change_type_val := 'height_changed';
      END IF;
      IF OLD.construction_details IS DISTINCT FROM NEW.construction_details THEN
        changed_fields_val := array_append(changed_fields_val, 'construction_details');
      END IF;
      IF OLD.metadata IS DISTINCT FROM NEW.metadata THEN
        changed_fields_val := array_append(changed_fields_val, 'metadata');
      END IF;
      IF change_type_val IS NULL THEN
        change_type_val := 'updated';
      END IF;
    ELSIF TG_OP = 'DELETE' THEN
      change_type_val := 'deleted';
      changed_fields_val := ARRAY[]::TEXT[];
    END IF;
    
    -- Insert history record
    INSERT INTO building_history (
      building_id,
      version_number,
      change_type,
      snapshot,
      encoded_vector,
      changed_fields,
      created_at
    ) VALUES (
      COALESCE(NEW.id, OLD.id),
      next_version,
      change_type_val,
      building_snapshot,
      COALESCE(NEW.encoded_vector, OLD.encoded_vector),
      changed_fields_val,
      NOW()
    );
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for building history
CREATE TRIGGER trigger_building_history_insert
  AFTER INSERT ON buildings
  FOR EACH ROW
  EXECUTE FUNCTION create_building_history();

CREATE TRIGGER trigger_building_history_update
  AFTER UPDATE ON buildings
  FOR EACH ROW
  EXECUTE FUNCTION create_building_history();

CREATE TRIGGER trigger_building_history_delete
  AFTER DELETE ON buildings
  FOR EACH ROW
  EXECUTE FUNCTION create_building_history();

-- Comments
COMMENT ON TABLE building_history IS 'Complete audit trail of all building changes';
COMMENT ON COLUMN building_history.snapshot IS 'Full JSONB snapshot of building state at this version';
COMMENT ON COLUMN building_history.encoded_vector IS 'Encoded vector at this version for reconstruction';
COMMENT ON COLUMN building_history.changed_fields IS 'Array of field names that changed in this version';
