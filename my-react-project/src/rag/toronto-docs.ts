/**
 * Toronto Construction & Traffic Document Extracts
 * 
 * Pre-extracted text chunks from official 2024-2026 Toronto municipal sources.
 * Prioritized by recency + relevance to construction/traffic/noise.
 * 
 * PDF Sources (saved in /public/docs/):
 * - CMP Fall 2024: backgroundfile-248783.pdf
 * - CMP 2023: backgroundfile-239866.pdf
 * - TIS 2013: city-planning-transportation-impact-study-toronto-tis-guidelines-2013.pdf
 * - Traffic Disruption 2015: backgroundfile-74394.pdf
 */

import type { RagDocument } from './types';

export const TORONTO_DOCS: RagDocument[] = [
  // ========================================
  // 1. Congestion Management Plan 2023-2026 Fall Update (Sep 2024)
  // ========================================
  {
    id: 'cmp-fall-2024',
    content: `Congestion Management Plan 2023-26 Fall Update (September 2024):
Toronto is the busiest construction city in North America. Key updates:

QR CODES: QR codes are now MANDATORY on all construction sites. Must display project name, duration, and contact information.

DELAY THRESHOLDS: Any construction causing >5% traffic delay requires mitigation measures. This includes traffic agents for concrete pours, signal timing adjustments, and alternative routing plans.

AI TRAFFIC SIMULATION: AI-powered traffic simulation system planned for Q1 2025 rollout across the city.

RoDARS FEES: Road Disruption Activity Reporting System application fee is $76. All road occupancy permits must go through RoDARS.

CONGESTION LEVY: New congestion levy proposed for 2025 budget. Charged per square metre with peak pricing during rush hours.

CONSTRUCTION HUBS: Construction Hub program expanded to include Yonge-Eglinton corridor. Hubs coordinate multiple projects in same area to minimize cumulative impact.

DON'T BLOCK THE BOX: Automated enforcement cameras being deployed at key intersections.

NOISE BYLAWS: Remain unchanged from previous update. 7AM-7PM weekdays standard hours.`,
    metadata: {
      doc: 'CMP-Fall2024',
      priority: 1,
      source: 'City of Toronto Infrastructure & Environment Committee',
      sourceUrl: 'https://www.toronto.ca/legdocs/mmis/2024/ie/bgrd/backgroundfile-248783.pdf',
      location: 'Toronto, ON',
      category: 'construction',
      datePublished: '2024-09',
    },
  },

  // ========================================
  // 2. Congestion Management Plan 2023-2026 (Oct 2023 Baseline)
  // ========================================
  {
    id: 'cmp-2023-baseline',
    content: `Congestion Management Plan 2023-26 (October 2023 Baseline):
Toronto processes approximately 40,000 construction permits per year.

RODARS CENTRAL: Online Road Disruption Activity Reporting System launching Q1 2024. Digital QR code compliance tracking.

CONSTRUCTION HUBS: New hubs established in Wards 3, 8, and 19. Centralized coordination for overlapping construction projects.

TRAFFIC AGENTS: Expanded Traffic Agent program with TPS (Toronto Police Service) pilot. Agents deployed at high-impact construction zones.

SMART SIGNALS: Smart signal technology deployed at 59 locations. Key corridors: Sheppard Avenue and Kingston Road.

TRANSIT SIGNAL PRIORITY (TSP): 52 new TSP installations to prioritize TTC vehicles through construction zones.

TEMP TEAM: Temporary Event Management Program team handles special events (Exhibition, Rogers Centre, etc.) that overlap with construction.

PERMIT COORDINATION: Multi-utility coordination mandatory for projects on arterial roads. Joint excavation when possible.`,
    metadata: {
      doc: 'CMP-2023',
      priority: 2,
      source: 'City of Toronto Infrastructure & Environment Committee',
      sourceUrl: 'https://www.toronto.ca/legdocs/mmis/2023/ie/bgrd/backgroundfile-239866.pdf',
      location: 'Toronto, ON',
      category: 'construction',
      datePublished: '2023-10',
    },
  },

  // ========================================
  // 3. Toronto Transportation Impact Study (TIS) Guidelines 2013
  // ========================================
  {
    id: 'tis-guidelines-2013',
    content: `Toronto Transportation Impact Study (TIS) Guidelines (2013, referenced through 2026):

DELAY THRESHOLDS: Construction causing more than 5% traffic delay requires full mitigation plan. This is the primary threshold used for all impact assessments.

PEAK HOURS: Official peak hours defined as 7:00-9:00 AM and 4:00-6:00 PM weekdays. All impact studies must assess both peak periods.

LEVEL OF SERVICE: Maximum acceptable Level of Service (LOS) is D for residential areas. LOS E or F requires mandatory mitigation.

MODAL SPLIT ANALYSIS: All TIS must include modal split analysis covering auto, transit, cycling, and pedestrian modes.

STUDY AREA: Default study area extends 400m from project boundary for residential, 800m for commercial/mixed-use.

MITIGATION HIERARCHY: 1) Reduce trips, 2) Shift mode, 3) Shift timing, 4) Physical infrastructure. Must demonstrate all steps considered.

MONITORING: Post-construction traffic monitoring required for projects with >500 peak hour trips. 6-month and 2-year check.

TRUCK ROUTES: Construction vehicles must use designated truck routes. Routes require City approval through RoDARS.`,
    metadata: {
      doc: 'TIS-2013',
      priority: 3,
      source: 'City of Toronto City Planning Division',
      sourceUrl: 'https://www.toronto.ca/wp-content/uploads/2023/08/8695-city-planning-transportation-impact-study-toronto-tis-guidelines-2013.pdf',
      location: 'Toronto, ON',
      category: 'traffic',
      datePublished: '2013-01',
    },
  },

  // ========================================
  // 4. Managing Traffic Disruption City-Led Construction (2015)
  // ========================================
  {
    id: 'traffic-disruption-2015',
    content: `Managing Traffic Disruption from City-Led Construction (2015, referenced through 2026):

LANE CLOSURES: Extended hours and night work requires advance notice to residents and businesses. Minimum 7-day notice for lane closures on arterial roads.

TTC COORDINATION: Mandatory coordination with Toronto Transit Commission for construction affecting transit routes. TTC requires 7-day advance notice. No Line 1 subway shuttles; surface alternatives must be arranged.

SIGNAL TIMING: Temporary signal timing adjustments required when construction reduces road capacity. City Traffic Operations must approve all changes.

SIGNAGE: Construction signage must follow City standards. Advance warning signs at 200m, 100m, and at work zone. Bilingual where required.

POLICE COORDINATION: Toronto Police Service required for complex lane closures, intersection work, and high-traffic events. Minimum 48-hour notice for TPS booking.

EMERGENCY ACCESS: All construction zones must maintain emergency vehicle access at all times. Fire route clearance minimum 6m width.

PEDESTRIAN ACCESS: Temporary pedestrian walkways required when sidewalks closed. Must be accessible (AODA compliant). 1.5m minimum width.

CYCLING: Temporary cycling facilities required when bike lanes disrupted. Must connect to nearest safe cycling route.`,
    metadata: {
      doc: 'Traffic-Disruption-2015',
      priority: 4,
      source: 'City of Toronto Public Works',
      sourceUrl: 'https://www.toronto.ca/legdocs/mmis/2015/pw/bgrd/backgroundfile-74394.pdf',
      location: 'Toronto, ON',
      category: 'traffic',
      datePublished: '2015-01',
    },
  },

  // ========================================
  // 5. Toronto Noise Bylaw (2026 Reference)
  // ========================================
  {
    id: 'noise-bylaw-2026',
    content: `Toronto Noise Bylaw (Current as of 2026):

AMBIENT LEVELS: Maximum noise at property line must not exceed 65dB ambient level, or ambient +5dB, whichever is greater.

EXEMPTION MAXIMUM: Exemption permits allow up to 85dB maximum at property line.

CONSTRUCTION HOURS: Standard permitted construction hours are 7:00 AM to 7:00 PM weekdays. Saturday 9:00 AM to 7:00 PM. No construction noise on Sundays and statutory holidays.

NIGHT PERMITS: Night work permits cost $100-$600 depending on scope. Processing time 3-4 weeks. Must demonstrate necessity (e.g., road closures, concrete pours requiring continuous work).

FINES: Noise bylaw violations start at $900 per offense. Repeat offenders face escalating fines up to $100,000 for corporations.

EXEMPTIONS: Crane operations and continuous concrete pours may receive automatic exemption with proper documentation. Emergency utility work exempt.

MONITORING: City may require continuous noise monitoring for sensitive receptors (hospitals, schools, residential within 30m). Reports submitted weekly.

VIBRATION: Ground vibration limits: 5mm/s at residential structures, 12mm/s at commercial. Pre-condition surveys required within 30m of pile driving.`,
    metadata: {
      doc: 'Noise-Bylaw-2026',
      priority: 2,
      source: 'City of Toronto Municipal Licensing & Standards',
      location: 'Toronto, ON',
      category: 'noise',
      datePublished: '2026-01',
    },
  },

  // ========================================
  // 6. RoDARS & TTC Coordination
  // ========================================
  {
    id: 'rodars-ttc',
    content: `RoDARS (Road Disruption Activity Reporting System) & TTC Coordination:

RoDARS REQUIREMENTS: All road occupancy and excavation work requires RoDARS permit. Application fee $76. Online submission through Toronto.ca.

PERMIT TYPES: Temporary road occupancy, excavation, crane placement, scaffolding, material storage on road allowance.

TTC NOTICE: Minimum 7 calendar days advance notice to TTC for any work affecting transit routes or stops.

TTC RESTRICTIONS: No shuttle service replacements for Line 1 Yonge-University during construction. Surface route alternatives must be arranged with TTC Operations.

COORDINATION WINDOWS: City encourages construction during TTC off-peak (10AM-3PM weekdays) for work near transit stops.

UTILITY COORDINATION: Joint utility trench program — when one utility opens road, others invited to coordinate. Reduces total disruption time.

BOND REQUIREMENTS: Road restoration bond required. Amount based on area and road classification. Released after 2-year warranty inspection.

INSPECTION: City inspectors verify restoration quality. Failed inspections require re-do at contractor's expense.`,
    metadata: {
      doc: 'RoDARS-TTC',
      priority: 3,
      source: 'City of Toronto Transportation Services',
      location: 'Toronto, ON',
      category: 'transit',
      datePublished: '2024-01',
    },
  },

  // ========================================
  // 7. Toronto Zoning Bylaw Highlights (Construction-Relevant)
  // ========================================
  {
    id: 'zoning-construction',
    content: `Toronto Zoning Bylaw - Construction-Relevant Highlights:

DENSITY: Maximum permitted density varies by zone. Check site-specific zoning for FSI (Floor Space Index) limits.

SETBACKS: Minimum setbacks affect crane swing radius and construction staging. Front: varies 3-7.5m residential. Side: 0.9-1.5m residential.

HEIGHT: Building height limits define crane height requirements and aviation clearance needs. Varies by zone; Downtown up to 100m+.

PARKING: Minimum parking requirements affect underground construction scope. Varies by use and transit proximity.

LOADING: Loading space requirements affect construction staging and delivery scheduling. Commercial requires minimum 1 Type G loading space.

GREEN STANDARDS: Toronto Green Standard v4 applies to all new construction. Energy efficiency, stormwater management, tree preservation requirements.

HERITAGE: Heritage-listed buildings require Heritage Permit for alterations. Additional consultation time 4-8 weeks.

SITE PLAN APPROVAL: Most development requires Site Plan Approval. Includes traffic, servicing, and landscaping review. Timeline 6-12 months.`,
    metadata: {
      doc: 'Zoning-Construction',
      priority: 4,
      source: 'City of Toronto City Planning Division',
      location: 'Toronto, ON',
      category: 'zoning',
      datePublished: '2024-01',
    },
  },
];

/** PDF download manifest — URLs to fetch and save to /public/docs/ */
export const TORONTO_PDF_SOURCES = [
  {
    filename: 'cmp-fall-2024.pdf',
    url: 'https://www.toronto.ca/legdocs/mmis/2024/ie/bgrd/backgroundfile-248783.pdf',
    docId: 'cmp-fall-2024',
    title: 'Congestion Management Plan 2023-2026 Fall Update (Sep 2024)',
  },
  {
    filename: 'cmp-2023-baseline.pdf',
    url: 'https://www.toronto.ca/legdocs/mmis/2023/ie/bgrd/backgroundfile-239866.pdf',
    docId: 'cmp-2023-baseline',
    title: 'Congestion Management Plan 2023-2026 (Oct 2023)',
  },
  {
    filename: 'tis-guidelines-2013.pdf',
    url: 'https://www.toronto.ca/wp-content/uploads/2023/08/8695-city-planning-transportation-impact-study-toronto-tis-guidelines-2013.pdf',
    docId: 'tis-guidelines-2013',
    title: 'Transportation Impact Study Guidelines (TIS) 2013',
  },
  {
    filename: 'traffic-disruption-2015.pdf',
    url: 'https://www.toronto.ca/legdocs/mmis/2015/pw/bgrd/backgroundfile-74394.pdf',
    docId: 'traffic-disruption-2015',
    title: 'Managing Traffic Disruption City-Led Construction (2015)',
  },
];
