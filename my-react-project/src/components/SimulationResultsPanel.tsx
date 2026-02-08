import { useState, useEffect } from "react";
import type maplibregl from "maplibre-gl";
import type { SimulationStats } from "../App";

interface NearbyPlace {
  name: string;
  address: string;
  type: string;
  priority: number;
}

interface SimulationResultsPanelProps {
  stats: SimulationStats;
  isVisible: boolean;
  onClose: () => void;
  buildingCount?: number;
  closedRoads?: number;
  map?: maplibregl.Map | null;
  centerPoint?: [number, number];
}

/**
 * Query nearby buildings and POIs within a pixel radius from a center point
 */
function getNearbyBuildingsAndPOIs(
  map: maplibregl.Map,
  centerPoint: [number, number],
  radiusPixels: number = 500
): NearbyPlace[] {
  const centerPixel = map.project(centerPoint);
  const zoom = map.getZoom();
  
  console.log('[Nearby Buildings Query] ===== START =====');
  console.log('[Nearby Buildings Query] Center point (construction site):', centerPoint);
  console.log('[Nearby Buildings Query] Center pixel:', { x: centerPixel.x, y: centerPixel.y });
  console.log('[Nearby Buildings Query] Map zoom level:', zoom);
  console.log('[Nearby Buildings Query] Search radius:', radiusPixels, 'pixels');
  
  const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
    [centerPixel.x - radiusPixels, centerPixel.y - radiusPixels],
    [centerPixel.x + radiusPixels, centerPixel.y + radiusPixels]
  ];
  
  console.log('[Nearby Buildings Query] Bounding box:', {
    sw: bbox[0],
    ne: bbox[1]
  });
  
  // Query BOTH building and POI layers
  const possibleLayers = [
    'building',
    'poi-label',
    'poi',
    'place-label',
    'poi_label',
  ];
  
  // Filter to only existing layers
  const existingLayers = possibleLayers.filter(layerId => {
    try {
      return map.getLayer(layerId) !== undefined;
    } catch {
      return false;
    }
  });
  
  console.log('[Nearby Buildings Query] Available layers:', existingLayers);
  
  if (existingLayers.length === 0) {
    console.warn('No POI or building layers found');
    return [];
  }
  
  const features = map.queryRenderedFeatures(bbox, {
    layers: existingLayers
  });
  
  console.log('[Nearby Buildings Query] Total features found:', features.length);
  
  const results = new Map<string, NearbyPlace>();
  
  features.forEach((feature, idx) => {
    const props = feature.properties || {};
    const id = feature.id || props.osm_id || props.id || Math.random();
    const featureId = String(id);
    
    // Debug: log first 3 features to see available properties
    if (idx < 3) {
      console.log('[Nearby Buildings Debug] Feature properties:', {
        layer: feature.layer?.id,
        name: props.name,
        allProps: Object.keys(props),
        sampleProps: props
      });
    }
    
    if (results.has(featureId)) return;
    
    // Extract name (prioritize business/brand names)
    const name = props.name 
      || props['name:en']
      || props.brand
      || props.operator
      || props.amenity
      || props.shop
      || 'Unnamed Building';
    
    // Extract type/category
    const type = props.class
      || props.type
      || props.amenity
      || props.shop
      || props.building
      || 'building';
    
    // Build address with multiple fallback strategies
    const addressParts = [
      props['addr:housenumber'],
      props['addr:street']
    ].filter(Boolean);
    
    let address = '';
    if (addressParts.length > 0) {
      // Has street address
      address = addressParts.join(' ');
      if (props['addr:city']) address += ', ' + props['addr:city'];
    } else if (props.address) {
      // Fallback to 'address' property (some tilesets use this)
      address = props.address;
    } else if (props['addr:full']) {
      // Some tilesets have full address in one field
      address = props['addr:full'];
    } else {
      // Last resort: show neighborhood or use coordinates
      const neighborhood = props.neighbourhood || props.suburb || props.district;
      if (neighborhood) {
        address = neighborhood + ', Toronto';
      } else {
        // Use feature coordinates as last resort
        const coords = feature.geometry?.type === 'Point' 
          ? feature.geometry.coordinates 
          : null;
        if (coords) {
          address = `${coords[1].toFixed(4)}°N, ${coords[0].toFixed(4)}°W`;
        } else {
          address = 'Toronto';
        }
      }
    }
    
    // Priority scoring (named POIs > named buildings > unnamed)
    let priority = 0;
    if (props.name || props.brand) priority += 10; // Has a real name
    if (props.amenity || props.shop) priority += 5; // Is a business/POI
    if (feature.layer?.id?.includes('poi')) priority += 3; // From POI layer
    
    results.set(featureId, {
      name: name.length > 50 ? name.substring(0, 47) + '...' : name,
      address,
      type,
      priority
    });
  });
  
  // Sort by priority (named businesses first), then return top 5
  const sorted = Array.from(results.values())
    .sort((a, b) => b.priority - a.priority);
  
  console.log('[Nearby Buildings Query] Total unique places after dedup:', sorted.length);
  console.log('[Nearby Buildings Query] Top 10 by priority:', sorted.slice(0, 10).map(p => ({
    name: p.name,
    priority: p.priority,
    type: p.type,
    address: p.address
  })));
  console.log('[Nearby Buildings Query] ===== END =====\n');
  
  return sorted.slice(0, 5);
}

/**
 * Get icon emoji for place type
 */
function getTypeIcon(type: string): string {
  const iconMap: Record<string, string> = {
    restaurant: '🍽️',
    food: '🍔',
    cafe: '☕',
    bank: '🏦',
    atm: '💰',
    hospital: '🏥',
    pharmacy: '💊',
    school: '🏫',
    university: '🎓',
    library: '📚',
    hotel: '🏨',
    shop: '🛍️',
    supermarket: '🛒',
    retail: '🏪',
    office: '🏢',
    commercial: '🏢',
    residential: '🏘️',
    parking: '🅿️',
    gas_station: '⛽',
    church: '⛪',
    mosque: '🕌',
    place_of_worship: '🛐',
    park: '🌳',
    stadium: '🏟️',
    cinema: '🎬',
    theatre: '🎭',
    gym: '💪',
    police: '👮',
    fire_station: '🚒',
  };
  
  return iconMap[type] || '🏢';
}

export function SimulationResultsPanel({
  stats,
  isVisible,
  onClose,
  buildingCount = 0,
  closedRoads = 0,
  map = null,
  centerPoint,
}: SimulationResultsPanelProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [nearbyBuildings, setNearbyBuildings] = useState<NearbyPlace[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Query nearby buildings when panel opens or center changes
  useEffect(() => {
    if (!map || !centerPoint || !isVisible || isMinimized) {
      console.log('[Nearby Buildings] Skipping query:', { 
        hasMap: !!map, 
        hasCenterPoint: !!centerPoint, 
        isVisible, 
        isMinimized 
      });
      return;
    }
    
    async function fetchNearbyBuildingsWithAddresses() {
      try {
        // Use 100 pixel radius for nearby buildings (roughly 100-200m depending on zoom)
        console.log('[Nearby Buildings] Starting query at:', centerPoint, 'with 100px radius');
        const buildings = getNearbyBuildingsAndPOIs(map!, centerPoint!, 100);
        
        // Geocode each building to get real address
        const token = import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
        
        if (token && buildings.length > 0) {
          console.log('[Nearby Buildings] Geocoding addresses...');
          const withAddresses = await Promise.all(
            buildings.map(async (building) => {
              // If already has a street address, keep it
              if (!building.address.includes('°N')) {
                return building;
              }
              
              // Extract coordinates from address
              const coords = building.address.match(/([\d.]+)°N, ([\d.]+)°W/);
              if (!coords) return building;
              
              const lat = parseFloat(coords[1]);
              const lng = -parseFloat(coords[2]);
              
              try {
                const response = await fetch(
                  `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?` +
                  `access_token=${token}&types=address,poi&limit=1`
                );
                const data = await response.json();
                
                if (data.features && data.features.length > 0) {
                  const feature = data.features[0];
                  return {
                    ...building,
                    address: feature.place_name || building.address
                  };
                }
              } catch (err) {
                console.warn('[Nearby Buildings] Geocoding failed for:', building.name, err);
              }
              
              return building;
            })
          );
          
          console.log('[Nearby Buildings] Final results with addresses:', withAddresses.length, 'buildings');
          setNearbyBuildings(withAddresses);
        } else {
          console.log('[Nearby Buildings] Final results (no geocoding):', buildings.length, 'buildings');
          setNearbyBuildings(buildings);
        }
      } catch (error) {
        console.error('[Nearby Buildings] Failed to query:', error);
        setNearbyBuildings([]);
      }
    }
    
    fetchNearbyBuildingsWithAddresses();
  }, [map, centerPoint, isVisible, isMinimized]);

  // AI Analysis of nearby buildings impact
  useEffect(() => {
    if (!isVisible || isMinimized || nearbyBuildings.length === 0 || isAnalyzing) {
      return;
    }

    async function analyzeNearbyBuildingsImpact() {
      setIsAnalyzing(true);
      console.log('[AI Analysis] Starting analysis of nearby buildings...');
      
      try {

        // Build context about nearby buildings
        const buildingsList = nearbyBuildings.map((b, i) => 
          `${i + 1}. ${b.name} (${b.type}) - ${b.address}`
        ).join('\n');

        const buildingTypes = nearbyBuildings.map(b => b.type);
        const uniqueTypes = [...new Set(buildingTypes)];

        const query = `Analyze the impact of a NEW CONSTRUCTION PROJECT given these nearby buildings:

NEARBY BUILDINGS (within immediate vicinity, 2-10m radius):
${buildingsList}

BUILDING TYPES PRESENT: ${uniqueTypes.join(', ')}

CONSTRUCTION DETAILS:
- Buildings placed: ${buildingCount}
- Road segments closed: ${closedRoads}
- Traffic congestion: ${stats.closed > 0 ? 'Medium-High' : 'Low'}

Provide a brief, actionable analysis (3-5 sentences max) covering:

1. BUSINESS IMPACT: If multiple similar businesses (restaurants, stores, schools), discuss:
   - Competition effects (2+ restaurants = increased competition)
   - Market saturation concerns
   - Customer base dilution

2. FEASIBILITY CONCERNS: If unusual patterns detected:
   - Multiple schools/institutions (class size, enrollment impact)
   - Conflicting uses (industrial near residential)
   - Over-concentration of single type

3. COMMUNITY IMPACT: Consider:
   - Access disruption to essential services (hospitals, schools)
   - Parking shortage effects on nearby businesses
   - Foot traffic changes during construction

4. OPPORTUNITIES: Positive aspects:
   - Complementary businesses (coffee shop + bookstore)
   - Mixed-use development benefits
   - Urban density improvements

Keep response concise, specific, and Toronto-focused. Use plain language for city planners.`;

        // Call backend proxy (avoids CORS issues)
        // Backend automatically handles thread creation and caching
        const response = await fetch('http://localhost:3001/api/ai/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query,
            options: {
              llm_provider: 'openrouter',
              model_name: 'openai/gpt-4o-mini',
            }
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          console.error('[AI Analysis] API error:', error);
          setAiAnalysis('');
          return;
        }

        const result = await response.json();
        const analysis = result.answer || result.content || result.message || '';
        console.log('[AI Analysis] Complete. Length:', analysis.length, 'chars');
        
        setAiAnalysis(analysis);
      } catch (error) {
        console.error('[AI Analysis] Failed:', error);
        setAiAnalysis('');
      } finally {
        setIsAnalyzing(false);
      }
    }

    analyzeNearbyBuildingsImpact();
  }, [nearbyBuildings, buildingCount, closedRoads, stats.closed, isVisible, isMinimized, isAnalyzing]);

  if (!isVisible) return null;

  // Calculate traffic impact metrics
  const unreachableRate = stats.closed > 0 ? (stats.unreachable / stats.trips) * 100 : 0;
  
  // Estimate average delay in minutes based on closure impact
  // More realistic urban construction delay model:
  // - Base scenario: typical urban trip is ~10 min
  // - Each closure adds ~5-8% delay (not 2.5%) due to cascading congestion
  // - Higher impact if unreachable routes force major detours
  // - Urban construction typically causes 3-15 min delays in Toronto
  const baselineTimeMin = 10;
  const closureImpactFactor = 0.07; // 7% delay per closed road (conservative urban estimate)
  const detourPenalty = unreachableRate > 5 ? 1.5 : 1.0; // 50% worse if many routes blocked
  
  const delayMultiplier = stats.closed > 0 
    ? 1 + (stats.closed * closureImpactFactor * detourPenalty) 
    : 1;
  
  const estimatedDelayMin = Math.max(0, (baselineTimeMin * delayMultiplier) - baselineTimeMin);
  
  const congestionLevel = unreachableRate > 10 ? "High" : unreachableRate > 5 ? "Medium" : "Low";
  const affectedTrips = stats.unreachable;

  return (
    <div
      className="simulation-results-panel"
      style={{
        position: "absolute",
        top: "14px",
        right: "14px",
        width: isMinimized ? "200px" : "320px",
        maxHeight: "80vh",
        overflowY: "auto",
        padding: "12px 14px",
        borderRadius: "10px",
        background: "rgba(255, 255, 255, 0.98)",
        border: "1px solid rgba(22, 26, 33, 0.15)",
        boxShadow: "0 8px 26px rgba(12, 16, 22, 0.25)",
        zIndex: 1000,
        transition: "width 0.3s ease",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <h2 style={{ margin: 0, fontSize: "17px", color: "#111827" }}>Simulation Results</h2>
        <div>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: "14px",
              marginRight: "8px",
            }}
          >
            {isMinimized ? "⛶" : "⊟"}
          </button>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: "18px",
            }}
          >
            ×
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Traffic Impact Section */}
          <section style={{ marginBottom: "16px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "8px", color: "#1f2937" }}>
              Traffic Impact
            </h3>
            <div style={{ fontSize: "12px", color: "#374151" }}>
              <div style={{ marginBottom: "6px" }}>
                <strong>Congestion Level:</strong>{" "}
                <span
                  style={{
                    color: congestionLevel === "High" ? "#dc2626" : congestionLevel === "Medium" ? "#f59e0b" : "#10b981",
                  }}
                >
                  {congestionLevel}
                </span>
              </div>
              <div style={{ marginBottom: "6px" }}>
                <strong>Average Delay:</strong>{" "}
                {estimatedDelayMin < 1 
                  ? `${Math.round(estimatedDelayMin * 60)} seconds`
                  : `${estimatedDelayMin.toFixed(1)} minutes`
                }
              </div>
              <div style={{ marginBottom: "6px" }}>
                <strong>Affected Trips:</strong> {affectedTrips} / {stats.trips}
              </div>
              <div style={{ marginBottom: "6px" }}>
                <strong>Unreachable Routes:</strong> {stats.unreachable}
              </div>
            </div>
            
            {/* What this means */}
            <div style={{ marginTop: "10px", padding: "8px", background: "#f9fafb", borderRadius: "6px", fontSize: "11px", color: "#4b5563", lineHeight: "1.5" }}>
              <strong>What this means:</strong>
              {congestionLevel === "Low" && (
                <p style={{ margin: "4px 0 0 0" }}>
                  Traffic is flowing well in the simulated area. Current road closures have minimal impact on the network. 
                  {stats.unreachable > 0 && ` ${stats.unreachable} route${stats.unreachable > 1 ? 's' : ''} require${stats.unreachable === 1 ? 's' : ''} detours.`}
                </p>
              )}
              {congestionLevel === "Medium" && (
                <p style={{ margin: "4px 0 0 0" }}>
                  Some delays are expected. Trips are averaging{" "}
                  {estimatedDelayMin < 1 
                    ? `${Math.round(estimatedDelayMin * 60)} seconds`
                    : `~${Math.round(estimatedDelayMin)} minutes`
                  } longer than usual. 
                  {stats.unreachable > 0 && ` ${stats.unreachable} route${stats.unreachable > 1 ? 's' : ''} are blocked and need alternative paths.`}
                </p>
              )}
              {congestionLevel === "High" && (
                <p style={{ margin: "4px 0 0 0" }}>
                  Significant delays likely. Trips are averaging{" "}
                  {estimatedDelayMin < 1 
                    ? `${Math.round(estimatedDelayMin * 60)} seconds`
                    : `~${Math.round(estimatedDelayMin)} minutes`
                  } longer than usual. 
                  {stats.unreachable > 0 && ` ${stats.unreachable} route${stats.unreachable > 1 ? 's' : ''} cannot reach their destination.`}
                  {" "}Consider mitigation measures.
                </p>
              )}
            </div>
          </section>

          {/* Building Impact */}
          {buildingCount > 0 && (
            <section style={{ marginBottom: "16px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "8px", color: "#1f2937" }}>
                Construction Impact
              </h3>
              <div style={{ fontSize: "12px", color: "#374151" }}>
                <div style={{ marginBottom: "6px" }}>
                  <strong>Buildings Placed:</strong> {buildingCount}
                </div>
                <div style={{ marginBottom: "6px" }}>
                  <strong>Road Segments Closed:</strong> {closedRoads}
                </div>
              </div>
            </section>
          )}

          {/* Nearby Buildings & POIs */}
          {nearbyBuildings.length > 0 && (
            <section style={{ marginBottom: "16px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "8px", color: "#1f2937" }}>
                📍 Nearby Buildings
              </h3>
              <div style={{ fontSize: "12px", color: "#374151" }}>
                {nearbyBuildings.map((building, index) => (
                  <div 
                    key={`${building.name}-${index}`}
                    style={{ 
                      marginBottom: "8px", 
                      padding: "8px", 
                      background: "#f9fafb", 
                      borderRadius: "4px",
                      borderLeft: "3px solid #3b82f6"
                    }}
                  >
                    <div style={{ 
                      fontWeight: "600", 
                      color: "#111827",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      marginBottom: "3px"
                    }}>
                      <span>{getTypeIcon(building.type)}</span>
                      <span>{building.name}</span>
                    </div>
                    <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "3px" }}>
                      {building.address}
                    </div>
                    {building.type !== 'building' && (
                      <div style={{ 
                        fontSize: "10px", 
                        color: "#9ca3af", 
                        marginTop: "2px",
                        textTransform: "capitalize"
                      }}>
                        {building.type.replace(/_/g, ' ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* AI-Powered Context Analysis */}
          {nearbyBuildings.length > 0 && (
            <section style={{ marginBottom: "16px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "8px", color: "#1f2937" }}>
                🤖 AI Impact Analysis
              </h3>
              {isAnalyzing ? (
                <div style={{ 
                  padding: "12px", 
                  background: "#f0f9ff", 
                  borderRadius: "6px",
                  border: "1px solid #bae6fd",
                  fontSize: "12px",
                  color: "#0369a1",
                  textAlign: "center"
                }}>
                  <div style={{ marginBottom: "6px" }}>🔄 Analyzing nearby context...</div>
                  <div style={{ fontSize: "10px", color: "#0c4a6e" }}>
                    Evaluating business competition, feasibility, and community impact
                  </div>
                </div>
              ) : aiAnalysis ? (
                <div style={{ 
                  padding: "10px", 
                  background: "#fefce8", 
                  borderRadius: "6px",
                  border: "1px solid #fde047",
                  fontSize: "11px",
                  color: "#713f12",
                  lineHeight: "1.6"
                }}>
                  <div style={{ 
                    fontWeight: "600", 
                    marginBottom: "6px", 
                    color: "#854d0e",
                    fontSize: "12px"
                  }}>
                    Contextual Insights:
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>
                    {aiAnalysis}
                  </div>
                  <div style={{ 
                    marginTop: "8px", 
                    paddingTop: "8px", 
                    borderTop: "1px solid #fde047",
                    fontSize: "10px",
                    color: "#a16207"
                  }}>
                    ⚡ Powered by Gemini 2.0 Flash · Based on local building context
                  </div>
                </div>
              ) : (
                <div style={{ 
                  padding: "8px", 
                  background: "#f3f4f6", 
                  borderRadius: "6px",
                  fontSize: "11px",
                  color: "#6b7280",
                  fontStyle: "italic"
                }}>
                  Enable AI analysis by setting VITE_BACKBOARD_API_KEY in .env
                </div>
              )}
            </section>
          )}

          {/* Recommendations */}
          {unreachableRate > 5 && (
            <section>
              <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "8px", color: "#dc2626" }}>
                ⚠️ Mitigation Recommended
              </h3>
              <div style={{ fontSize: "11px", color: "#7f1d1d", padding: "8px", background: "#fee2e2", borderRadius: "6px", lineHeight: "1.5" }}>
                <p style={{ margin: "0 0 6px 0" }}>
                  <strong>Traffic delay exceeds 5% threshold.</strong> Under Toronto guidelines, this level of impact typically requires a Traffic Impact Study (TIS) and mitigation plan.
                </p>
                <p style={{ margin: "6px 0 0 0", color: "#991b1b" }}>
                  🎯 <strong>Next step:</strong> Use the <strong>Analyze</strong> button on any building to generate a detailed impact report with regulatory requirements, recommended actions, and estimated costs based on Toronto's construction guidelines.
                </p>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
