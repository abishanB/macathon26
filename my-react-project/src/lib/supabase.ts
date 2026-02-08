/**
 * Supabase Client Singleton
 * 
 * Provides database access for storing buildings, projects, and history.
 * Handles vector encoding/decoding for building coordinates.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment variables (set in .env)
// Support both browser (import.meta.env) and Node.js (process.env) contexts
const getEnvVar = (key: string): string => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || '';
  }
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return (import.meta.env as any)[key] || '';
  }
  return '';
};

const SUPABASE_URL = getEnvVar('VITE_SUPABASE_URL') || getEnvVar('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = getEnvVar('VITE_SUPABASE_ANON_KEY') || getEnvVar('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = getEnvVar('VITE_SUPABASE_SERVICE_ROLE_KEY') || getEnvVar('SUPABASE_SERVICE_ROLE_KEY') || '';

// Singleton client instance
let _client: SupabaseClient | null = null;
let _adminClient: SupabaseClient | null = null;

/**
 * Get Supabase client (public/anonymous access)
 */
export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase credentials not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
    );
  }

  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false, // For server-side usage
    },
  });

  return _client;
}

/**
 * Get Supabase admin client (service role - full access)
 * Use with caution - bypasses RLS policies
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (_adminClient) return _adminClient;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Supabase admin credentials not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_ROLE_KEY in .env'
    );
  }

  _adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
    },
  });

  return _adminClient;
}

/**
 * Vector encoding/decoding utilities
 */
export const VectorUtils = {
  /**
   * Encode coordinates to Base64-encoded vector string
   */
  encode(coordinates: number[][] | number[][][]): string {
    try {
      const json = JSON.stringify(coordinates);
      const bytes = new TextEncoder().encode(json);
      const base64 = btoa(String.fromCharCode(...bytes));
      return base64;
    } catch (error) {
      console.error('Failed to encode vector:', error);
      throw new Error('Vector encoding failed');
    }
  },

  /**
   * Decode Base64-encoded vector string to coordinates
   */
  decode(encoded: string): number[][] | number[][][] {
    try {
      const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
      const json = new TextDecoder().decode(bytes);
      return JSON.parse(json);
    } catch (error) {
      console.error('Failed to decode vector:', error);
      throw new Error('Vector decoding failed');
    }
  },

  /**
   * Encode GeoJSON geometry to vector
   */
  encodeGeometry(geometry: GeoJSON.Geometry): string {
    if (geometry.type === 'Point') {
      return this.encode([geometry.coordinates as number[]]);
    } else if (geometry.type === 'Polygon') {
      return this.encode(geometry.coordinates);
    } else if (geometry.type === 'MultiPolygon') {
      return this.encode(geometry.coordinates);
    }
    throw new Error(`Unsupported geometry type: ${geometry.type}`);
  },

  /**
   * Decode vector to GeoJSON coordinates
   */
  decodeToCoordinates(encoded: string): number[][] | number[][][] {
    return this.decode(encoded);
  },
};

export default getSupabaseClient;
