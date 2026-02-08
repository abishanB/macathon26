/**
 * Building Database Operations
 * 
 * Functions for storing and retrieving buildings from Supabase database.
 * Handles vector encoding/decoding automatically.
 */

import { getSupabaseClient, VectorUtils } from './supabase';
import type { Building, ConstructionDetails } from '../types/building';

export interface BuildingRecord {
  id: string;
  project_id: string;
  geometry: any; // PostGIS geometry (returned as GeoJSON)
  building_type: string;
  height: number;
  base_height: number;
  stories?: number;
  footprint?: number;
  encoded_vector?: string;
  construction_details?: ConstructionDetails;
  impact_analysis?: any;
  status: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  description?: string;
  location_name?: string;
  bbox?: any;
  user_id?: string;
  session_id?: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

/**
 * Create or get a project by session ID
 */
export async function getOrCreateProject(
  sessionId: string,
  name: string = 'Untitled Project',
  locationName?: string,
  bbox?: [number, number, number, number] // [minLng, minLat, maxLng, maxLat]
): Promise<ProjectRecord> {
  const supabase = getSupabaseClient();

  // Try to find existing project
  const { data: existing, error: findError } = await supabase
    .from('projects')
    .select('*')
    .eq('session_id', sessionId)
    .is('deleted_at', null)
    .single();

  if (existing && !findError) {
    return existing as ProjectRecord;
  }

  // Create new project
  const projectData: any = {
    name,
    session_id: sessionId,
    metadata: {},
  };

  if (locationName) {
    projectData.location_name = locationName;
  }

  if (bbox) {
    // Create PostGIS polygon from bbox
    projectData.bbox = `SRID=4326;POLYGON((
      ${bbox[0]} ${bbox[1]},
      ${bbox[2]} ${bbox[1]},
      ${bbox[2]} ${bbox[3]},
      ${bbox[0]} ${bbox[3]},
      ${bbox[0]} ${bbox[1]}
    ))`;
  }

  const { data: newProject, error: createError } = await supabase
    .from('projects')
    .insert(projectData)
    .select()
    .single();

  if (createError || !newProject) {
    throw new Error(`Failed to create project: ${createError?.message || 'Unknown error'}`);
  }

  return newProject as ProjectRecord;
}

/**
 * Save a building to the database
 */
export async function saveBuilding(
  projectId: string,
  building: {
    geometry: GeoJSON.Geometry;
    buildingType: string;
    height: number;
    baseHeight?: number;
    stories?: number;
    footprint?: number;
    constructionDetails?: ConstructionDetails;
    impactAnalysis?: any;
    metadata?: any;
  }
): Promise<BuildingRecord> {
  const supabase = getSupabaseClient();

  // Encode vector
  const encodedVector = VectorUtils.encodeGeometry(building.geometry);

  // Use RPC function to insert building with geometry conversion
  // This is needed because Supabase PostgREST doesn't directly handle PostGIS geometry
  const { data, error } = await supabase.rpc('insert_building_with_geometry', {
    p_project_id: projectId,
    p_geojson: JSON.stringify(building.geometry),
    p_building_type: building.buildingType,
    p_height: building.height,
    p_base_height: building.baseHeight || 0,
    p_stories: building.stories || null,
    p_footprint: building.footprint || null,
    p_encoded_vector: encodedVector,
    p_vector_format: 'base64-json',
    p_construction_details: building.constructionDetails || {},
    p_impact_analysis: building.impactAnalysis || null,
    p_status: 'placed',
    p_metadata: building.metadata || {},
  });

  if (error) {
    // Check if function doesn't exist (migrations not run)
    if (error.message?.includes('Could not find the function') || error.message?.includes('does not exist')) {
      throw new Error(
        `Database function not found. Please run migrations first:\n` +
        `1. Go to Supabase Dashboard → SQL Editor\n` +
        `2. Run migrations 001-007 from database/migrations/\n` +
        `3. Original error: ${error.message}`
      );
    }
    throw new Error(`Failed to save building: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('Failed to save building: No data returned');
  }

  // RPC function returns array, get first result
  return data[0] as BuildingRecord;
}

/**
 * Get all buildings for a project
 */
export async function getBuildings(projectId: string): Promise<BuildingRecord[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('buildings')
    .select('*')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get buildings: ${error.message}`);
  }

  return (data || []) as BuildingRecord[];
}

/**
 * Update a building
 */
export async function updateBuilding(
  buildingId: string,
  updates: {
    height?: number;
    baseHeight?: number;
    stories?: number;
    footprint?: number;
    constructionDetails?: ConstructionDetails;
    impactAnalysis?: any;
    metadata?: any;
  }
): Promise<BuildingRecord> {
  const supabase = getSupabaseClient();

  const updateData: any = {};
  if (updates.height !== undefined) updateData.height = updates.height;
  if (updates.baseHeight !== undefined) updateData.base_height = updates.baseHeight;
  if (updates.stories !== undefined) updateData.stories = updates.stories;
  if (updates.footprint !== undefined) updateData.footprint = updates.footprint;
  if (updates.constructionDetails) updateData.construction_details = updates.constructionDetails;
  if (updates.impactAnalysis) updateData.impact_analysis = updates.impactAnalysis;
  if (updates.metadata) updateData.metadata = updates.metadata;

  const { data, error } = await supabase
    .from('buildings')
    .update(updateData)
    .eq('id', buildingId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update building: ${error?.message || 'Unknown error'}`);
  }

  return data as BuildingRecord;
}

/**
 * Delete a building (soft delete)
 */
export async function deleteBuilding(buildingId: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('buildings')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', buildingId);

  if (error) {
    throw new Error(`Failed to delete building: ${error.message}`);
  }
}

/**
 * Get building history
 */
export async function getBuildingHistory(buildingId: string): Promise<any[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('building_history')
    .select('*')
    .eq('building_id', buildingId)
    .order('version_number', { ascending: false });

  if (error) {
    throw new Error(`Failed to get building history: ${error.message}`);
  }

  return data || [];
}
