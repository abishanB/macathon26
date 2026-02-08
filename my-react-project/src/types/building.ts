/**
 * Building and construction impact types
 */

// Re-export the network context type so UI components can import from one place
export type { NetworkContext, NearbyRoad, TrafficSummary } from "../traffic/buildingContext";

export interface Building {
  id: string;
  coordinates: [number, number]; // [lng, lat]
  footprint: number; // square meters
  height: number; // meters
  stories: number;
  type: BuildingType;
  constructionDetails?: ConstructionDetails;
}

export type BuildingType =
  | 'residential'
  | 'commercial'
  | 'mixed-use'
  | 'industrial'
  | 'institutional';

export interface ConstructionDetails {
  // Timeline
  duration: number; // days
  startDate?: Date;
  endDate?: Date;
  workHours: WorkHours;

  // Construction phases
  phases: ConstructionPhase[];

  // Traffic & Access
  laneClosures: number;
  parkingSpacesLost: number;
  deliveryTrucksPerDay: number;
  stagingAreaSize: number; // square meters

  // Environmental
  dustControlMeasures: boolean;
  noiseControlMeasures: boolean;
  workDuringPeakHours: boolean;

  // Building specifics
  excavationDepth: number; // meters
  foundationType: 'shallow' | 'deep' | 'piles';
  parkingSpacesCreated: number;
  expectedOccupancy: number; // people per day
}

export interface WorkHours {
  start: string; // 24h format "07:00"
  end: string;   // 24h format "19:00"
  weekendWork: boolean;
  nightConstruction: boolean;
}

export interface ConstructionPhase {
  name: string;
  duration: number; // days
  trafficImpact: 'low' | 'medium' | 'high' | 'severe';
  noiseLevel: number; // dB
  dustLevel: 'low' | 'medium' | 'high';
}

export interface ImpactAnalysis {
  // Traffic impacts
  trafficCongestion: {
    peakHourDelay: number; // minutes
    averageDelay: number; // minutes
    affectedRoutes: string[];
    detourRequired: boolean;
    transitRoutesAffected: string[];
  };

  // Environmental impacts
  environmental: {
    airQuality: {
      pm10Increase: number; // μg/m³
      pm25Increase: number; // μg/m³
      complianceStatus: 'compliant' | 'non-compliant' | 'requires-mitigation';
    };
    noise: {
      peakLevel: number; // dB
      exceedsLimits: boolean;
      affectedResidents: number;
      mitigationRequired: boolean;
    };
    dust: {
      level: 'low' | 'medium' | 'high';
      controlMeasuresRequired: string[];
    };
  };

  // Economic & social impacts
  economic: {
    businessImpact: 'minimal' | 'moderate' | 'significant' | 'severe';
    estimatedRevenueLoss: number; // dollars
    affectedBusinesses: number;
  };

  // Regulatory compliance
  compliance: {
    requiredPermits: string[];
    trafficManagementPlanRequired: boolean;
    environmentalAssessmentRequired: boolean;
    communityConsultationRequired: boolean;
    mitigationMeasures: string[];
  };

  // Overall assessment
  overall: {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    severity: number; // 1-10
    recommendedActions: string[];
    estimatedTotalImpact: string;
  };

  // RAG sources
  sources: Array<{
    document: string;
    relevance: string;
  }>;

  // AI-generated analysis
  narrative: string;

  // Live traffic graph context (populated before sending to RAG)
  networkContext?: import("../traffic/buildingContext").NetworkContext;
}

export interface BuildingFormData {
  // Building specs
  buildingType: BuildingType;
  stories: number;
  footprintWidth: number; // meters
  footprintLength: number; // meters

  // Construction timeline
  constructionDuration: number; // months
  startDate: string;
  workHoursStart: string;
  workHoursEnd: string;
  weekendWork: boolean;
  nightWork: boolean;

  // Traffic impact
  laneClosures: number;
  parkingSpacesLost: number;
  deliveryTrucksPerDay: number;

  // Environmental
  excavationDepth: number;
  foundationType: 'shallow' | 'deep' | 'piles';
  dustControl: boolean;
  noiseControl: boolean;

  // Post-construction
  parkingSpacesCreated: number;
  expectedOccupancy: number;
}
