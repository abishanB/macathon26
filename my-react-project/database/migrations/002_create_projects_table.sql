-- ============================================================================
-- Migration: 002_create_projects_table.sql
-- Description: Create projects table to group buildings by session/project
-- Created: 2026-02-07
-- ============================================================================

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Project metadata
  name VARCHAR(255) NOT NULL,
  description TEXT,
  location_name VARCHAR(255), -- e.g., "Toronto, ON"
  bbox GEOMETRY(POLYGON, 4326), -- Bounding box for the project area
  
  -- User/session info
  user_id UUID, -- Optional: link to auth.users if using Supabase Auth
  session_id VARCHAR(255), -- Browser session identifier
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ, -- Soft delete
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb -- Additional project data
);

-- Indexes
CREATE INDEX idx_projects_user_id ON projects(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_session_id ON projects(session_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_created_at ON projects(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_bbox ON projects USING GIST(bbox) WHERE deleted_at IS NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_projects_updated_at();

-- Comments
COMMENT ON TABLE projects IS 'Projects/sessions that group buildings together';
COMMENT ON COLUMN projects.bbox IS 'Bounding box of the project area in WGS84 (EPSG:4326)';
COMMENT ON COLUMN projects.metadata IS 'Additional project metadata stored as JSON';
