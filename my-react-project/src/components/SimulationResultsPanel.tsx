import { useEffect, useState } from "react";
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
  const avgDelay = stats.closed > 0 ? (stats.unreachable / stats.trips) * 100 : 0;
  const congestionLevel = avgDelay > 10 ? "High" : avgDelay > 5 ? "Medium" : "Low";
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
                <strong>Average Delay:</strong> {avgDelay.toFixed(1)}%
              </div>
              <div style={{ marginBottom: "6px" }}>
                <strong>Affected Trips:</strong> {affectedTrips} / {stats.trips}
              </div>
              <div style={{ marginBottom: "6px" }}>
                <strong>Unreachable Routes:</strong> {stats.unreachable}
              </div>
            </div>
          </section>

          {/* Network Stats */}
          <section style={{ marginBottom: "16px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "8px", color: "#1f2937" }}>
              Network Statistics
            </h3>
            <div style={{ fontSize: "12px", color: "#374151", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              <div>Nodes: {stats.nodes}</div>
              <div>Edges: {stats.directedEdges}</div>
              <div>Total Trips: {stats.trips}</div>
              <div>Probe Trips: {stats.probeTrips}</div>
              <div>Closed Roads: {stats.closed}</div>
              <div>Runtime: {stats.runtimeMs}ms</div>
            </div>
          </section>

          {/* Building Impact */}
          {buildingCount > 0 && (
            <section style={{ marginBottom: "16px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "8px", color: "#1f2937" }}>
                Building Impact
              </h3>
              <div style={{ fontSize: "12px", color: "#374151" }}>
                <div style={{ marginBottom: "6px" }}>
                  <strong>Buildings Placed:</strong> {buildingCount}
                </div>
                <div style={{ marginBottom: "6px" }}>
                  <strong>Road Closures:</strong> {closedRoads}
                </div>
                <div style={{ padding: "8px", background: "#f3f4f6", borderRadius: "6px", fontSize: "11px" }}>
                  Buildings may affect traffic flow and require mitigation measures if delay exceeds 5%.
                </div>
              </div>
            </section>
          )}

          {/* Recommendations */}
          {avgDelay > 5 && (
            <section>
              <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "8px", color: "#dc2626" }}>
                ⚠️ Mitigation Required
              </h3>
              <div style={{ fontSize: "11px", color: "#7f1d1d", padding: "8px", background: "#fee2e2", borderRadius: "6px" }}>
                Traffic delay exceeds 5% threshold. Consider:
                <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                  <li>Traffic signal timing adjustments</li>
                  <li>Alternative routing plans</li>
                  <li>Traffic agents for high-impact zones</li>
                  <li>Peak hour restrictions</li>
                </ul>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
