import { useState } from "react";
import type { SimulationStats } from "../App";

interface SimulationResultsPanelProps {
  stats: SimulationStats;
  isVisible: boolean;
  onClose: () => void;
  buildingCount?: number;
  closedRoads?: number;
}

export function SimulationResultsPanel({
  stats,
  isVisible,
  onClose,
  buildingCount = 0,
  closedRoads = 0,
}: SimulationResultsPanelProps) {
  const [isMinimized, setIsMinimized] = useState(false);

  if (!isVisible) return null;

  // Calculate traffic impact metrics
  const unreachableRate = stats.closed > 0 ? (stats.unreachable / stats.trips) * 100 : 0;
  
  // Estimate average delay in minutes based on closure impact
  // Assumption: typical trip is ~10 min, each closure adds ~2-3% delay
  const baselineTimeMin = 10;
  const delayMultiplier = stats.closed > 0 ? 1 + (stats.closed * 0.025) : 1;
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
