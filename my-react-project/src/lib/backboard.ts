/**
 * Backboard.io RAG/Memory Client
 * 
 * Correct API details (discovered from OpenAPI spec):
 * - Base URL: https://app.backboard.io/api
 * - Auth: X-API-Key header
 * - Flow: Create Assistant → Create Thread under Assistant → Upload Docs → Chat
 * - Doc upload: multipart/form-data with 'file' field
 * - Messages: multipart/form-data with 'content' field
 */

import type { RagDocMetadata, ThreadConfig, UploadResult, RagQueryResult } from '../rag/types';

interface BackboardClientConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface BackboardAssistant {
  assistant_id: string;
  name: string;
  description: string;
  system_prompt: string;
}

export interface BackboardThread {
  thread_id: string;
  created_at: string;
  messages: unknown[];
}

class BackboardClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: BackboardClientConfig) {
    this.apiKey = config.apiKey.trim();
    this.baseUrl = config.baseUrl || 'https://app.backboard.io/api';
  }

  private async requestJSON(endpoint: string, method: string, body?: unknown) {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      throw new Error(`Backboard ${method} ${endpoint} → ${res.status}: ${errText}`);
    }
    return res.json();
  }

  private async requestForm(endpoint: string, formData: FormData) {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'X-API-Key': this.apiKey },
      body: formData,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      throw new Error(`Backboard POST ${endpoint} → ${res.status}: ${errText}`);
    }
    return res.json();
  }

  // ── Assistants ──

  async listAssistants(): Promise<BackboardAssistant[]> {
    return this.requestJSON('/assistants', 'GET');
  }

  async createAssistant(opts: {
    name: string;
    description?: string;
    system_prompt?: string;
  }): Promise<BackboardAssistant> {
    return this.requestJSON('/assistants', 'POST', opts);
  }

  async getOrCreateAssistant(name: string, systemPrompt: string): Promise<BackboardAssistant> {
    const assistants = await this.listAssistants();
    const existing = assistants.find(a => a.name === name);
    if (existing) return existing;
    return this.createAssistant({ name, system_prompt: systemPrompt });
  }

  /**
   * Get or create assistant with improved prompt (v2)
   * Use this for new threads to get better focused answers
   */
  async getOrCreateImprovedAssistant(): Promise<BackboardAssistant> {
    const name = `${TORONTO_ASSISTANT_CONFIG.name} (v2)`;
    return this.getOrCreateAssistant(name, TORONTO_ASSISTANT_CONFIG.systemPrompt);
  }

  // ── Threads ──

  async listThreads(): Promise<any[]> {
    return this.requestJSON('/threads', 'GET');
  }

  async createThreadForAssistant(assistantId: string): Promise<BackboardThread> {
    return this.requestJSON(`/assistants/${assistantId}/threads`, 'POST', {});
  }

  async getThread(threadId: string) {
    return this.requestJSON(`/threads/${threadId}`, 'GET');
  }

  async listAssistantThreads(assistantId: string): Promise<BackboardThread[]> {
    return this.requestJSON(`/assistants/${assistantId}/threads`, 'GET');
  }

  // ── Documents ──

  async uploadDocumentToThread(
    threadId: string,
    doc: { content: string; metadata?: RagDocMetadata; filename?: string }
  ): Promise<UploadResult> {
    try {
      const filename = doc.filename || `${doc.metadata?.doc || 'document'}.txt`;
      const blob = new Blob([doc.content], { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', blob, filename);

      const result = await this.requestForm(`/threads/${threadId}/documents`, formData);
      return {
        success: true,
        documentId: result.document_id || result.id || 'unknown',
        threadId,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`Upload failed [${doc.metadata?.doc}]:`, errMsg);
      return { success: false, documentId: '', threadId, error: errMsg };
    }
  }

  async uploadPdfToThread(
    threadId: string,
    pdfPath: string,
    filename: string
  ): Promise<UploadResult> {
    const errMsg = `PDF upload from filesystem path is not supported in this browser build (${pdfPath}).`;
    console.error(`PDF upload failed [${filename}]:`, errMsg);
    return { success: false, documentId: '', threadId, error: errMsg };
  }

  async listDocuments(threadId: string) {
    return this.requestJSON(`/threads/${threadId}/documents`, 'GET');
  }

  // ── Messages / Chat ──

  async addMessage(threadId: string, content: string, opts?: { llm_provider?: string; model_name?: string }) {
    const formData = new FormData();
    formData.append('content', content);
    if (opts?.llm_provider) formData.append('llm_provider', opts.llm_provider);
    if (opts?.model_name) formData.append('model_name', opts.model_name);
    return this.requestForm(`/threads/${threadId}/messages`, formData);
  }

  /**
   * Enhanced chat method with better query formatting for focused answers
   */
  async chat(threadId: string, message: string, options?: {
    includeContext?: boolean;
    format?: 'concise' | 'detailed';
  }): Promise<RagQueryResult> {
    // Format the query to ensure focused answers
    const formattedQuery = this.formatQueryForFocusedAnswer(message, options);
    
    const result = await this.addMessage(threadId, formattedQuery);
    return {
      answer: result.answer || result.content || result.message || JSON.stringify(result),
      sources: result.sources || [],
      confidence: result.confidence || 0,
    };
  }

  /**
   * Formats user queries to ensure the AI answers only the specific question asked
   */
  private formatQueryForFocusedAnswer(
    userQuery: string,
    options?: { includeContext?: boolean; format?: 'concise' | 'detailed' }
  ): string {
    const format = options?.format || 'concise';
    
    // More explicit instructions to prevent query mixing
    const instruction = `IMPORTANT: Answer ONLY the question below. This is a standalone query. Do NOT reference, summarize, or consolidate previous questions or answers. Each question must be answered independently.

${format === 'concise' 
  ? 'Provide a direct, precise answer with exact numbers and thresholds.' 
  : 'Provide a detailed answer with exact values, thresholds, document citations, and specific requirements.'}

Question: ${userQuery}

Answer Requirements:
1. Answer THIS question only - ignore any previous context
2. Include exact numerical values (e.g., ">5%", "65dB", "$76")
3. Cite the specific document name (e.g., "CMP 2023-26 Fall Update", "TIS Guidelines 2013")
4. Do NOT mention other topics or regulations unless directly relevant
5. If the question asks for a threshold, state the exact value first, then explain

Example format:
"Answer: [Direct answer with exact value]. Source: [Document name]. Details: [Supporting information]."`;

    return instruction;
  }

  /**
   * Analyze building construction impact on urban systems
   * Returns comprehensive impact analysis covering traffic, environment, compliance
   */
  async analyzeConstructionImpact(
    threadId: string,
    constructionDetails: {
      location: [number, number]; // [lng, lat]
      buildingType: string;
      stories: number;
      footprint: number; // m²
      duration: number; // months
      laneClosures: number;
      parkingLost: number;
      deliveryTrucks: number;
      excavationDepth: number;
      workHours: { start: string; end: string; weekend: boolean; night: boolean };
      dustControl: boolean;
      noiseControl: boolean;
      expectedOccupancy: number;
      networkContext?: import('../traffic/buildingContext').NetworkContext;
    }
  ) {
    // Build live traffic network section if context is available
    const nc = constructionDetails.networkContext;
    const networkSection = nc
      ? `
LIVE TRAFFIC NETWORK CONTEXT (from real road graph):
- Nearest road node: ${nc.nearestNodeDistanceM}m away
- Roads within 400m: ${nc.nearbyRoads.length}
${nc.nearbyRoads.slice(0, 8).map(r =>
  `  • ${r.name} (${r.highway}): ${r.distanceM}m away, vol=${r.volume} veh/hr, V/C=${r.vcRatio}, delay×${r.delayFactor}`
).join('\n')}
${nc.footprintRoads.length > 0 ? `- Roads INSIDE footprint: ${nc.footprintRoads.length} (direct construction impact)` : ''}
${nc.suggestedClosures.length > 0 ? `- Roads flagged for closure: ${nc.suggestedClosures.length}` : ''}

PRE-CONSTRUCTION TRAFFIC SUMMARY:
- Avg delay factor: ${nc.baseline.avgDelayFactor}× (1.0 = free-flow)
- Max delay factor: ${nc.baseline.maxDelayFactor}×
- Total volume: ${nc.baseline.totalVolume} veh/hr
- Network capacity used: ${nc.baseline.networkCapacityPct}%

ESTIMATED POST-CONSTRUCTION SUMMARY (with closures applied):
- Avg delay factor: ${nc.estimated.avgDelayFactor}× (Δ${(nc.estimated.avgDelayFactor - nc.baseline.avgDelayFactor).toFixed(2)})
- Max delay factor: ${nc.estimated.maxDelayFactor}× (Δ${(nc.estimated.maxDelayFactor - nc.baseline.maxDelayFactor).toFixed(2)})
- Total volume: ${nc.estimated.totalVolume} veh/hr
- Network capacity used: ${nc.estimated.networkCapacityPct}% (Δ${nc.estimated.networkCapacityPct - nc.baseline.networkCapacityPct}%)`
      : '';

    const query = `Analyze the impact of this proposed building construction in Toronto:

LOCATION: ${constructionDetails.location[1].toFixed(4)}, ${constructionDetails.location[0].toFixed(4)}

BUILDING DETAILS:
- Type: ${constructionDetails.buildingType}
- Stories: ${constructionDetails.stories}
- Footprint: ${constructionDetails.footprint}m²
- Post-completion occupancy: ${constructionDetails.expectedOccupancy} people/day

CONSTRUCTION DETAILS:
- Duration: ${constructionDetails.duration} months
- Work hours: ${constructionDetails.workHours.start} - ${constructionDetails.workHours.end}
- Weekend work: ${constructionDetails.workHours.weekend ? 'Yes' : 'No'}
- Night construction: ${constructionDetails.workHours.night ? 'Yes' : 'No'}
- Excavation depth: ${constructionDetails.excavationDepth}m

TRAFFIC IMPACT:
- Lane closures: ${constructionDetails.laneClosures}
- Parking spaces lost: ${constructionDetails.parkingLost}
- Delivery trucks per day: ${constructionDetails.deliveryTrucks}

ENVIRONMENTAL CONTROLS:
- Dust control measures: ${constructionDetails.dustControl ? 'Yes' : 'No'}
- Noise control measures: ${constructionDetails.noiseControl ? 'Yes' : 'No'}
${networkSection}
Provide a COMPREHENSIVE analysis in JSON format:
{
  "trafficImpact": {
    "estimatedDelay": <number (%)>,
    "peakHourDelay": <number (minutes)>,
    "affectedRoutes": [<list of potentially affected routes>],
    "detourRequired": <boolean>,
    "transitImpact": "<description>",
    "complianceStatus": "<compliant|requires-mitigation|non-compliant>"
  },
  "environmental": {
    "airQuality": {
      "pm10Estimate": <number (μg/m³)>,
      "pm25Estimate": <number (μg/m³)>,
      "dustLevel": "<low|medium|high>",
      "complianceStatus": "<compliant|requires-mitigation|non-compliant>"
    },
    "noise": {
      "peakNoiseLevel": <number (dB)>,
      "exceedsLimits": <boolean>,
      "mitigationRequired": <boolean>,
      "complianceWithBylaw": "<compliant|non-compliant>"
    }
  },
  "economicImpact": {
    "businessImpact": "<minimal|moderate|significant|severe>",
    "estimatedBusinessLoss": <number ($ CAD)>,
    "affectedBusinessCount": <number>
  },
  "compliance": {
    "requiredPermits": [<list of permits>],
    "trafficManagementPlanRequired": <boolean>,
    "environmentalAssessment": <boolean>,
    "communityConsultation": <boolean>,
    "mitigationMeasures": [<list of required actions>]
  },
  "overall": {
    "riskLevel": "<low|medium|high|critical>",
    "severity": <1-10>,
    "recommendedActions": [<list of recommended actions>],
    "estimatedTotalImpact": "<summary>"
  },
  "narrative": "<comprehensive 2-3 paragraph analysis covering all impacts and Toronto-specific requirements>"
}

Base your analysis on:
- TIS Guidelines 2013 (delay thresholds, peak hours)
- CMP 2023-26 (traffic management, construction coordination)
- Noise Bylaw 2026 (65dB limits, work hours 7AM-7PM)
- Traffic Disruption Management 2015 (lane closures, TTC coordination)
- RoDARS requirements (permits, fees, notice periods)
- Environmental pollution from construction (PM10/PM2.5 standards)

Focus on:
1. Traffic congestion and delay analysis (>5% delay threshold)
2. Environmental impacts (air quality, noise, dust)
3. Transit route disruptions
4. Economic impact on local businesses
5. Regulatory compliance requirements
6. Required mitigation measures

Provide specific, quantitative estimates where possible, and cite relevant Toronto regulations.`;

    const result = await this.addMessage(threadId, query, {
      llm_provider: 'openrouter',
      model_name: 'google/gemini-2.5-pro',
    });
    const answer = result.answer || result.content || result.message || '';

    // Try to parse JSON from the answer
    try {
      // Look for JSON in the response
      const jsonMatch = answer.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          ...parsed,
          sources: result.sources || [],
          rawAnswer: answer,
        };
      }
    } catch (e) {
      console.error('Failed to parse JSON response:', e);
    }

    // Fallback structured response if parsing fails
    return {
      trafficImpact: {
        estimatedDelay: constructionDetails.laneClosures > 1 ? 7 : 3,
        peakHourDelay: constructionDetails.laneClosures * 5 + constructionDetails.deliveryTrucks * 0.5,
        affectedRoutes: ['Major arterial roads within 500m'],
        detourRequired: constructionDetails.laneClosures > 1,
        transitImpact: 'Minor delays possible if near transit routes',
        complianceStatus: 'requires-mitigation',
      },
      environmental: {
        airQuality: {
          pm10Estimate: constructionDetails.dustControl ? 50 : 150,
          pm25Estimate: constructionDetails.dustControl ? 25 : 75,
          dustLevel: constructionDetails.dustControl ? 'low' : 'high',
          complianceStatus: constructionDetails.dustControl ? 'compliant' : 'requires-mitigation',
        },
        noise: {
          peakNoiseLevel: constructionDetails.noiseControl ? 65 : 80,
          exceedsLimits: !constructionDetails.noiseControl || constructionDetails.workHours.night,
          mitigationRequired: !constructionDetails.noiseControl,
          complianceWithBylaw: constructionDetails.noiseControl && !constructionDetails.workHours.night ? 'compliant' : 'non-compliant',
        },
      },
      economicImpact: {
        businessImpact: constructionDetails.laneClosures > 2 ? 'significant' : 'moderate',
        estimatedBusinessLoss: constructionDetails.duration * constructionDetails.laneClosures * 10000,
        affectedBusinessCount: Math.floor(constructionDetails.footprint / 100),
      },
      compliance: {
        requiredPermits: ['Building Permit', 'RoDARS Permit', 'Lane Closure Permit'],
        trafficManagementPlanRequired: constructionDetails.laneClosures > 0,
        environmentalAssessment: constructionDetails.stories > 10,
        communityConsultation: true,
        mitigationMeasures: [
          'Implement dust control measures',
          'Traffic management plan required',
          'Coordinate with TTC if near transit routes',
          'Limit work to 7AM-7PM weekdays',
        ],
      },
      overall: {
        riskLevel: constructionDetails.laneClosures > 2 ? 'high' : 'medium',
        severity: Math.min(10, 3 + constructionDetails.laneClosures * 2),
        recommendedActions: [
          'Submit Traffic Management Plan',
          'Obtain required permits before start',
          'Implement environmental controls',
          'Coordinate with local businesses',
        ],
        estimatedTotalImpact: answer.substring(0, 300) || 'Moderate impact expected. Mitigation required.',
      },
      narrative: answer || 'Unable to generate detailed analysis. Please review construction parameters.',
      sources: result.sources || [],
      rawAnswer: answer,
    };
  }

  /**
   * Analyze simulation results against Toronto regulations
   * Returns structured analysis with severity, compliance, and recommendations
   */
  async analyzeSimulationResults(
    threadId: string,
    simResults: {
      delay?: number;
      affectedArea?: string;
      peakHourImpact?: number;
      vehicleCount?: number;
      congestionLevel?: string;
    },
    location?: string
  ): Promise<{
    severity: number; // 1-10
    affected: string;
    summary: string;
    fixes: string[];
    compliance: {
      delayThreshold: boolean;
      noiseCompliant: boolean;
      requiresMitigation: boolean;
    };
  }> {
    const locationContext = location ? `Location: ${location}. ` : '';
    const delay = simResults.delay || 0;
    const peakImpact = simResults.peakHourImpact || 0;

    const analysisQuery = `${locationContext}Analyze these traffic simulation results against Toronto regulations:

Simulation Results:
- Traffic Delay: ${delay}%
- Peak Hour Impact: ${peakImpact}%
- Affected Area: ${simResults.affectedArea || 'Unknown'}
- Vehicle Count: ${simResults.vehicleCount || 'Unknown'}
- Congestion Level: ${simResults.congestionLevel || 'Unknown'}

Required Analysis (JSON format):
{
  "severity": <1-10 rating>,
  "affected": "<description of affected areas/population>",
  "summary": "<brief compliance summary>",
  "fixes": ["<mitigation action 1>", "<mitigation action 2>", ...],
  "compliance": {
    "delayThreshold": <true if delay <= 5%, false if >5%>,
    "noiseCompliant": <true/false based on construction hours and noise levels>,
    "requiresMitigation": <true if delay >5% or other violations>
  }
}

Compare against:
- TIS Guidelines: >5% delay requires mitigation
- CMP 2023-26: Traffic agents, signal timing, alternative routing
- Noise Bylaw: 7AM-7PM weekdays, 65dB max (or ambient+5dB)
- RoDARS: $76 permit fee, 7-day TTC notice

Provide the JSON response with specific, actionable recommendations.`;

    const result = await this.addMessage(threadId, analysisQuery);
    const answer = result.answer || result.content || result.message || '';

    // Try to parse JSON from the answer
    try {
      const jsonMatch = answer.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      // Fallback if JSON parsing fails
    }

    // Fallback structured response
    return {
      severity: delay > 5 ? 8 : delay > 3 ? 5 : 3,
      affected: simResults.affectedArea || 'Unknown area',
      summary: answer.substring(0, 200),
      fixes: ['Review delay mitigation requirements', 'Coordinate with TTC if near transit routes'],
      compliance: {
        delayThreshold: delay <= 5,
        noiseCompliant: true, // Would need noise data to determine
        requiresMitigation: delay > 5,
      },
    };
  }
}

// ── Singleton ──
let _client: BackboardClient | null = null;

export function getBackboardClient(): BackboardClient {
  if (_client) return _client;

  const nodeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const apiKey =
    nodeProcess?.env?.BACKBOARD_API_KEY ||
    nodeProcess?.env?.BACKBOARD_KEY ||
    (import.meta as any).env?.VITE_BACKBOARD_API_KEY ||
    '';

  if (!apiKey) {
    throw new Error('Backboard API key not found. Set BACKBOARD_API_KEY in .env');
  }

  _client = new BackboardClient({ apiKey });
  return _client;
}

/** Toronto assistant config */
export const TORONTO_ASSISTANT_CONFIG = {
  name: 'UrbanSim Toronto',
  systemPrompt: `You are an expert on Toronto municipal construction, traffic management, noise bylaws, and zoning regulations.

CRITICAL INSTRUCTIONS:
1. Answer ONLY the specific question asked. Do NOT reference previous queries or consolidate multiple topics.
2. Be precise with numbers, thresholds, and regulations. Include exact values (e.g., ">5% delay", "65dB", "$76 fee").
3. Cite the specific document source (e.g., "CMP 2023-26 Fall Update", "TIS Guidelines 2013", "Noise Bylaw 2026").
4. If the question asks about a specific topic, focus ONLY on that topic. Do not mention unrelated regulations.
5. Structure answers clearly: state the answer first, then provide supporting details.

Available documents:
- CMP 2023-26 Fall Update (Sep 2024): QR codes, delay thresholds (>5% = mitigation), RoDARS fees, congestion levy
- CMP 2023 Baseline: Construction hubs, traffic agents, smart signals, TSP
- TIS Guidelines 2013: Delay thresholds (>5%), peak hours (7-9AM, 4-6PM), LOS requirements
- Traffic Disruption 2015: Lane closures, TTC coordination, signal timing, signage
- Noise Bylaw 2026: Ambient levels (65dB or ambient+5dB), exemption max (85dB), hours (7AM-7PM), fines ($900+)
- RoDARS/TTC: Permit requirements, 7-day notice, no Line 1 shuttles
- Zoning: Density, setbacks, height limits, parking requirements`,
};

/** Pre-built Toronto thread config */
export const TORONTO_THREAD: ThreadConfig = {
  id: 'toronto_construction_2026',
  name: 'Toronto Construction & Traffic (2026)',
  description: 'Toronto municipal construction, traffic, noise, and zoning regulations.',
  location: 'Toronto, ON, Canada',
  bbox: '-79.64,43.58,-79.12,43.86',
};

export { BackboardClient };
export default getBackboardClient;
