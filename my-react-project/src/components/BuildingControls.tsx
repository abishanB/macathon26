/**
 * Building controls component for adjusting selected building properties
 */

import React from 'react';
import type { Building } from '../types/building';
import './BuildingControls.css';

interface BuildingControlsProps {
  building: Building;
  onUpdate: (updates: Partial<Building>) => void;
  onDelete: () => void;
  onAnalyze: () => void;
}

export const BuildingControls: React.FC<BuildingControlsProps> = ({
  building,
  onUpdate,
  onDelete,
  onAnalyze,
}) => {
  const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const height = parseFloat(e.target.value);
    const stories = Math.max(1, Math.floor(height / 3.5)); // ~3.5m per story
    onUpdate({ height, stories });
  };

  const handleFootprintChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const size = parseFloat(e.target.value);
    onUpdate({ footprint: size * size });
  };

  const currentSize = Math.sqrt(building.footprint);

  return (
    <div className="building-controls">
      <div className="controls-header">
        <h3>Building Controls</h3>
        <button className="btn-delete" onClick={onDelete} title="Delete building">
          🗑️
        </button>
      </div>

      <div className="controls-body">
        <div className="control-group">
          <label>
            <span className="control-label">Height: {building.height.toFixed(1)}m</span>
            <span className="control-sublabel">({building.stories} stories)</span>
          </label>
          <input
            type="range"
            min="10"
            max="200"
            step="5"
            value={building.height}
            onChange={handleHeightChange}
            className="slider"
          />
          <div className="slider-values">
            <span>10m</span>
            <span>200m</span>
          </div>
        </div>

        <div className="control-group">
          <label>
            <span className="control-label">Footprint: {currentSize.toFixed(1)}m × {currentSize.toFixed(1)}m</span>
            <span className="control-sublabel">({building.footprint.toFixed(0)}m²)</span>
          </label>
          <input
            type="range"
            min="10"
            max="100"
            step="5"
            value={currentSize}
            onChange={handleFootprintChange}
            className="slider"
          />
          <div className="slider-values">
            <span>10m</span>
            <span>100m</span>
          </div>
        </div>

        <div className="control-group">
          <label className="control-label">Building Type</label>
          <select
            value={building.type}
            onChange={(e) => onUpdate({ type: e.target.value as Building['type'] })}
            className="type-select"
          >
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
            <option value="mixed-use">Mixed-Use</option>
            <option value="industrial">Industrial</option>
            <option value="institutional">Institutional</option>
          </select>
        </div>

        <button className="btn-analyze" onClick={onAnalyze}>
          📊 Analyze Construction Impact
        </button>
      </div>
    </div>
  );
};
