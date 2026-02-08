import { useState } from 'react';
import './BuildingAnalysisPanel.css';

interface NearbyRoad {
  roadId: string | number;
  roadName?: string;
  highway?: string;
  distanceMeters: number;
  closestPoint: [number, number];
  roadLength: number;
}

interface BuildingAnalysisData {
  buildingId: string;
  centroid: [number, number];
  bounds: {
    minLng: number;
    maxLng: number;
    minLat: number;
    maxLat: number;
  };
  nearbyRoads: NearbyRoad[];
  affectedArea: {
    radiusMeters: number;
    roadsWithinRadius: number;
    estimatedTrafficImpact: 'low' | 'medium' | 'high' | 'severe';
  };
  encoding: {
    base64: string;
    byteSize: number;
  };
}

interface AnalysisSummary {
  buildingId: string;
  centroid: [number, number];
  closestRoadDistance: number | null;
  closestRoadName: string | null;
  totalNearbyRoads: number;
  majorRoadsAffected: number;
  totalRoadLengthAffected: number;
  impactLevel: 'low' | 'medium' | 'high' | 'severe';
  encodingSize: number;
}

interface BuildingAnalysisPanelProps {
  coordinates: number[][];
  onClose: () => void;
}

export function BuildingAnalysisPanel({ coordinates, onClose }: BuildingAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<BuildingAnalysisData | null>(null);
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [radius, setRadius] = useState(500);
  const [showEncoding, setShowEncoding] = useState(false);

  const analyzeBuilding = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:3001/api/buildings/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buildingId: `analysis-${Date.now()}`,
          coordinates,
          radiusMeters: radius
        })
      });

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`);
      }

      const data = await response.json();
      setAnalysis(data.analysis);
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const getImpactColor = (level: string) => {
    switch (level) {
      case 'severe': return '#dc3545';
      case 'high': return '#fd7e14';
      case 'medium': return '#ffc107';
      case 'low': return '#28a745';
      default: return '#6c757d';
    }
  };

  const getRoadTypeColor = (highway?: string) => {
    if (!highway) return '#6c757d';
    if (['motorway', 'trunk'].includes(highway)) return '#e74c3c';
    if (['primary', 'secondary'].includes(highway)) return '#f39c12';
    if (['tertiary', 'residential'].includes(highway)) return '#3498db';
    return '#95a5a6';
  };

  return (
    <div className="analysis-panel">
      <div className="analysis-header">
        <h3>🔬 Building Analysis</h3>
        <button className="btn-close-panel" onClick={onClose}>×</button>
      </div>

      <div className="analysis-body">
        <div className="analysis-controls">
          <label>
            Analysis Radius:
            <input
              type="number"
              value={radius}
              onChange={(e) => setRadius(parseInt(e.target.value) || 500)}
              min="100"
              max="2000"
              step="50"
            />
            <span>meters</span>
          </label>
          <button 
            className="btn-analyze-primary" 
            onClick={analyzeBuilding}
            disabled={loading}
          >
            {loading ? 'Analyzing...' : 'Analyze Building'}
          </button>
        </div>

        {error && (
          <div className="analysis-error">
            ❌ {error}
          </div>
        )}

        {summary && analysis && (
          <div className="analysis-results">
            {/* Impact Summary */}
            <div className="result-section">
              <h4>Traffic Impact</h4>
              <div 
                className="impact-badge"
                style={{ backgroundColor: getImpactColor(summary.impactLevel) }}
              >
                {summary.impactLevel.toUpperCase()}
              </div>
              <div className="result-stats">
                <div className="stat-item">
                  <span className="stat-label">Roads Affected</span>
                  <span className="stat-value">{summary.totalNearbyRoads}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Major Roads</span>
                  <span className="stat-value">{summary.majorRoadsAffected}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Total Road Length</span>
                  <span className="stat-value">{(summary.totalRoadLengthAffected / 1000).toFixed(2)} km</span>
                </div>
              </div>
            </div>

            {/* Building Location */}
            <div className="result-section">
              <h4>Building Location</h4>
              <div className="location-info">
                <div className="location-row">
                  <span className="location-label">Centroid:</span>
                  <code>{analysis.centroid[0].toFixed(6)}, {analysis.centroid[1].toFixed(6)}</code>
                </div>
                <div className="location-row">
                  <span className="location-label">Bounds:</span>
                  <code className="bounds-code">
                    Lng: {analysis.bounds.minLng.toFixed(6)} to {analysis.bounds.maxLng.toFixed(6)}<br/>
                    Lat: {analysis.bounds.minLat.toFixed(6)} to {analysis.bounds.maxLat.toFixed(6)}
                  </code>
                </div>
              </div>
            </div>

            {/* Closest Road */}
            {summary.closestRoadDistance !== null && (
              <div className="result-section">
                <h4>Closest Road</h4>
                <div className="closest-road">
                  <div className="road-distance">{summary.closestRoadDistance}m away</div>
                  <div className="road-name">{summary.closestRoadName || '(unnamed)'}</div>
                </div>
              </div>
            )}

            {/* Nearby Roads List */}
            <div className="result-section">
              <h4>Nearby Roads (within {radius}m)</h4>
              <div className="roads-list">
                {analysis.nearbyRoads.slice(0, 10).map((road, index) => (
                  <div key={index} className="road-item">
                    <div className="road-header">
                      <span 
                        className="road-type-badge"
                        style={{ backgroundColor: getRoadTypeColor(road.highway) }}
                      >
                        {road.highway || 'unknown'}
                      </span>
                      <span className="road-distance">{road.distanceMeters}m</span>
                    </div>
                    <div className="road-name">
                      {road.roadName || '(unnamed road)'}
                    </div>
                    <div className="road-details">
                      Length: {(road.roadLength / 1000).toFixed(2)} km
                    </div>
                  </div>
                ))}
                {analysis.nearbyRoads.length > 10 && (
                  <div className="roads-more">
                    ... and {analysis.nearbyRoads.length - 10} more roads
                  </div>
                )}
              </div>
            </div>

            {/* Encoding Info */}
            <div className="result-section">
              <h4>
                Data Encoding
                <button 
                  className="btn-toggle-encoding"
                  onClick={() => setShowEncoding(!showEncoding)}
                >
                  {showEncoding ? 'Hide' : 'Show'}
                </button>
              </h4>
              <div className="encoding-info">
                <div className="stat-item">
                  <span className="stat-label">Size</span>
                  <span className="stat-value">{analysis.encoding.byteSize} bytes</span>
                </div>
                {showEncoding && (
                  <div className="encoding-data">
                    <textarea 
                      readOnly 
                      value={analysis.encoding.base64}
                      rows={4}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {!summary && !loading && (
          <div className="analysis-placeholder">
            Click "Analyze Building" to see spatial analysis results
          </div>
        )}
      </div>
    </div>
  );
}
