-- ============================================================================
-- Migration: 001_enable_extensions.sql
-- Description: Enable required PostgreSQL extensions for UrbanSim
-- Created: 2026-02-07
-- ============================================================================

-- Enable PostGIS for geographic/geometric data storage
-- PostGIS provides native support for storing and querying spatial data
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Enable UUID generation for unique IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgcrypto for secure hashing/encoding if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Note: pgvector extension (for vector similarity search) is not enabled by default
-- in Supabase. If needed, contact Supabase support or use JSONB arrays for vectors.

COMMENT ON EXTENSION postgis IS 'PostGIS spatial database extension for geometry storage';
COMMENT ON EXTENSION "uuid-ossp" IS 'UUID generation functions';
COMMENT ON EXTENSION pgcrypto IS 'Cryptographic functions for encoding/decoding';
