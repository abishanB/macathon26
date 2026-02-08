/**
 * Building placement system for the map
 * Allows users to place, drag, and resize buildings
 */

import maplibregl from 'maplibre-gl';
import type { Building } from '../types/building';

const DEFAULT_BUILDING_HEIGHT = 30; // meters
const DEFAULT_BUILDING_SIZE = 20; // meters (square footprint)

export interface BuildingPlacerCallbacks {
  onBuildingPlaced: (building: Building) => void;
  onBuildingSelected: (building: Building | null) => void;
  onBuildingUpdated: (building: Building) => void;
}

export class BuildingPlacer {
  private map: maplibregl.Map;
  private buildings: Map<string, Building>;
  private selectedBuilding: Building | null = null;
  private callbacks: BuildingPlacerCallbacks;

  constructor(map: maplibregl.Map, callbacks: BuildingPlacerCallbacks) {
    this.map = map;
    this.buildings = new Map();
    this.callbacks = callbacks;
    this.initialize();
  }

  private initialize() {
    // Add source for buildings if it doesn't exist
    if (!this.map.getSource('placed-buildings')) {
      this.map.addSource('placed-buildings', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });
    }

    // Add 3D extrusion layer for buildings
    if (!this.map.getLayer('placed-buildings-3d')) {
      this.map.addLayer({
        id: 'placed-buildings-3d',
        type: 'fill-extrusion',
        source: 'placed-buildings',
        paint: {
          'fill-extrusion-color': [
            'case',
            ['==', ['get', 'selected'], true],
            '#4A90E2', // Selected: blue
            '#FF6B6B', // Normal: red/orange
          ],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.8,
        },
      });
    }

    // Add outline layer for better visibility
    if (!this.map.getLayer('placed-buildings-outline')) {
      this.map.addLayer({
        id: 'placed-buildings-outline',
        type: 'line',
        source: 'placed-buildings',
        filter: ['==', ['get', 'selected'], true],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#ffd166',
          'line-width': 4,
          'line-opacity': 1,
        },
      });
    }

    // Set up event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Click to place building
    this.map.on('click', (e: maplibregl.MapMouseEvent) => {
      const features = this.map.queryRenderedFeatures(e.point, {
        layers: ['placed-buildings-3d'],
      });

      if (features.length > 0) {
        // Clicked on existing building
        const buildingId = features[0].properties?.id;
        if (buildingId) {
          this.selectBuilding(buildingId);
        }
      } else if (this.map.getCanvas().style.cursor === 'crosshair') {
        // Place new building
        this.placeBuilding(e.lngLat);
      } else {
        // Deselect
        this.selectBuilding(null);
      }
    });

    // Hover effect
    this.map.on('mousemove', 'placed-buildings-3d', () => {
      this.map.getCanvas().style.cursor = 'pointer';
    });

    this.map.on('mouseleave', 'placed-buildings-3d', () => {
      if (this.map.getCanvas().style.cursor === 'pointer') {
        this.map.getCanvas().style.cursor = '';
      }
    });
  }

  /**
   * Enable building placement mode
   */
  public enablePlacementMode() {
    this.map.getCanvas().style.cursor = 'crosshair';
    console.log('Building placement mode enabled. Click on the map to place a building.');
  }

  /**
   * Disable building placement mode
   */
  public disablePlacementMode() {
    this.map.getCanvas().style.cursor = '';
  }

  /**
   * Place a new building at the specified location
   */
  private placeBuilding(lngLat: maplibregl.LngLat) {
    const building: Building = {
      id: `building-${Date.now()}`,
      coordinates: [lngLat.lng, lngLat.lat],
      footprint: DEFAULT_BUILDING_SIZE * DEFAULT_BUILDING_SIZE,
      height: DEFAULT_BUILDING_HEIGHT,
      stories: Math.floor(DEFAULT_BUILDING_HEIGHT / 3.5), // ~3.5m per story
      type: 'commercial', // Default type
    };

    this.buildings.set(building.id, building);
    this.selectBuilding(building.id);
    this.updateMapSource();
    this.callbacks.onBuildingPlaced(building);
    this.disablePlacementMode();
  }

  /**
   * Select a building by ID
   */
  public selectBuilding(buildingId: string | null) {
    if (buildingId === null) {
      this.selectedBuilding = null;
      this.callbacks.onBuildingSelected(null);
    } else {
      const building = this.buildings.get(buildingId);
      if (building) {
        this.selectedBuilding = building;
        this.callbacks.onBuildingSelected(building);
      }
    }
    this.updateMapSource();
  }

  /**
   * Update building properties
   */
  public updateBuilding(buildingId: string, updates: Partial<Building>) {
    const building = this.buildings.get(buildingId);
    if (building) {
      Object.assign(building, updates);
      this.buildings.set(buildingId, building);
      this.updateMapSource();
      this.callbacks.onBuildingUpdated(building);
    }
  }

  /**
   * Delete a building
   */
  public deleteBuilding(buildingId: string) {
    this.buildings.delete(buildingId);
    if (this.selectedBuilding?.id === buildingId) {
      this.selectedBuilding = null;
      this.callbacks.onBuildingSelected(null);
    }
    this.updateMapSource();
  }

  /**
   * Get selected building
   */
  public getSelectedBuilding(): Building | null {
    return this.selectedBuilding;
  }

  /**
   * Get all buildings
   */
  public getAllBuildings(): Building[] {
    return Array.from(this.buildings.values());
  }

  /**
   * Update the map source with current buildings
   */
  private updateMapSource() {
    const source = this.map.getSource('placed-buildings') as maplibregl.GeoJSONSource;
    if (source) {
      const features = Array.from(this.buildings.values()).map((building) => {
        const size = Math.sqrt(building.footprint);
        const offsetMeters = size / 2;
        // Approximate conversion: 1 degree ≈ 111km at equator
        const offsetDegrees = offsetMeters / 111000;

        return {
          type: 'Feature' as const,
          properties: {
            id: building.id,
            height: building.height,
            stories: building.stories,
            type: building.type,
            selected: building.id === this.selectedBuilding?.id,
          },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [
              [
                [building.coordinates[0] - offsetDegrees, building.coordinates[1] - offsetDegrees],
                [building.coordinates[0] + offsetDegrees, building.coordinates[1] - offsetDegrees],
                [building.coordinates[0] + offsetDegrees, building.coordinates[1] + offsetDegrees],
                [building.coordinates[0] - offsetDegrees, building.coordinates[1] + offsetDegrees],
                [building.coordinates[0] - offsetDegrees, building.coordinates[1] - offsetDegrees],
              ],
            ],
          },
        };
      });

      source.setData({
        type: 'FeatureCollection',
        features,
      });
    }
  }

  /**
   * Cleanup
   */
  public destroy() {
    if (this.map.getLayer('placed-buildings-outline')) {
      this.map.removeLayer('placed-buildings-outline');
    }
    if (this.map.getLayer('placed-buildings-3d')) {
      this.map.removeLayer('placed-buildings-3d');
    }
    if (this.map.getSource('placed-buildings')) {
      this.map.removeSource('placed-buildings');
    }
  }
}
