/**
 * Modal component for collecting building construction details
 */

import React, { useState } from 'react';
import type { Building, BuildingFormData, BuildingType } from '../types/building';
import './BuildingInfoModal.css';

interface BuildingInfoModalProps {
  building: Building;
  onSubmit: (formData: BuildingFormData) => void;
  onCancel: () => void;
}

export const BuildingInfoModal: React.FC<BuildingInfoModalProps> = ({
  building,
  onSubmit,
  onCancel,
}) => {
  const [formData, setFormData] = useState<BuildingFormData>({
    // Building specs
    buildingType: building.type,
    stories: building.stories,
    footprintWidth: Math.sqrt(building.footprint),
    footprintLength: Math.sqrt(building.footprint),

    // Construction timeline
    constructionDuration: 12, // months
    startDate: new Date().toISOString().split('T')[0],
    workHoursStart: '07:00',
    workHoursEnd: '19:00',
    weekendWork: false,
    nightWork: false,

    // Traffic impact
    laneClosures: 0,
    parkingSpacesLost: 0,
    deliveryTrucksPerDay: 10,

    // Environmental
    excavationDepth: 5,
    foundationType: 'shallow',
    dustControl: true,
    noiseControl: true,

    // Post-construction
    parkingSpacesCreated: 20,
    expectedOccupancy: 100,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const updateField = <K extends keyof BuildingFormData>(
    field: K,
    value: BuildingFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Construction Details</h2>
          <button className="close-button" onClick={onCancel}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Building Specifications */}
          <section className="form-section">
            <h3>Building Specifications</h3>

            <div className="form-row">
              <label>
                Building Type
                <select
                  value={formData.buildingType}
                  onChange={(e) => updateField('buildingType', e.target.value as BuildingType)}
                >
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="mixed-use">Mixed-Use</option>
                  <option value="industrial">Industrial</option>
                  <option value="institutional">Institutional</option>
                </select>
              </label>
            </div>

            <div className="form-row">
              <label>
                Number of Stories
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={formData.stories}
                  onChange={(e) => updateField('stories', parseInt(e.target.value))}
                />
              </label>

              <label>
                Footprint Width (m)
                <input
                  type="number"
                  min="5"
                  max="200"
                  value={formData.footprintWidth}
                  onChange={(e) => updateField('footprintWidth', parseFloat(e.target.value))}
                />
              </label>

              <label>
                Footprint Length (m)
                <input
                  type="number"
                  min="5"
                  max="200"
                  value={formData.footprintLength}
                  onChange={(e) => updateField('footprintLength', parseFloat(e.target.value))}
                />
              </label>
            </div>
          </section>

          {/* Construction Timeline */}
          <section className="form-section">
            <h3>Construction Timeline</h3>

            <div className="form-row">
              <label>
                Construction Duration (months)
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={formData.constructionDuration}
                  onChange={(e) => updateField('constructionDuration', parseInt(e.target.value))}
                />
              </label>

              <label>
                Start Date
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => updateField('startDate', e.target.value)}
                />
              </label>
            </div>

            <div className="form-row">
              <label>
                Work Hours Start
                <input
                  type="time"
                  value={formData.workHoursStart}
                  onChange={(e) => updateField('workHoursStart', e.target.value)}
                />
              </label>

              <label>
                Work Hours End
                <input
                  type="time"
                  value={formData.workHoursEnd}
                  onChange={(e) => updateField('workHoursEnd', e.target.value)}
                />
              </label>
            </div>

            <div className="form-row checkbox-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.weekendWork}
                  onChange={(e) => updateField('weekendWork', e.target.checked)}
                />
                Weekend Work
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.nightWork}
                  onChange={(e) => updateField('nightWork', e.target.checked)}
                />
                Night Construction
              </label>
            </div>
          </section>

          {/* Traffic Impact */}
          <section className="form-section">
            <h3>Traffic Impact</h3>

            <div className="form-row">
              <label>
                Lane Closures Required
                <input
                  type="number"
                  min="0"
                  max="6"
                  value={formData.laneClosures}
                  onChange={(e) => updateField('laneClosures', parseInt(e.target.value))}
                />
              </label>

              <label>
                Parking Spaces Lost
                <input
                  type="number"
                  min="0"
                  max="500"
                  value={formData.parkingSpacesLost}
                  onChange={(e) => updateField('parkingSpacesLost', parseInt(e.target.value))}
                />
              </label>

              <label>
                Delivery Trucks/Day
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.deliveryTrucksPerDay}
                  onChange={(e) => updateField('deliveryTrucksPerDay', parseInt(e.target.value))}
                />
              </label>
            </div>
          </section>

          {/* Environmental Factors */}
          <section className="form-section">
            <h3>Environmental Factors</h3>

            <div className="form-row">
              <label>
                Excavation Depth (m)
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="0.5"
                  value={formData.excavationDepth}
                  onChange={(e) => updateField('excavationDepth', parseFloat(e.target.value))}
                />
              </label>

              <label>
                Foundation Type
                <select
                  value={formData.foundationType}
                  onChange={(e) => updateField('foundationType', e.target.value as 'shallow' | 'deep' | 'piles')}
                >
                  <option value="shallow">Shallow Foundation</option>
                  <option value="deep">Deep Foundation</option>
                  <option value="piles">Pile Foundation</option>
                </select>
              </label>
            </div>

            <div className="form-row checkbox-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.dustControl}
                  onChange={(e) => updateField('dustControl', e.target.checked)}
                />
                Dust Control Measures
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.noiseControl}
                  onChange={(e) => updateField('noiseControl', e.target.checked)}
                />
                Noise Control Measures
              </label>
            </div>
          </section>

          {/* Post-Construction */}
          <section className="form-section">
            <h3>Post-Construction</h3>

            <div className="form-row">
              <label>
                Parking Spaces Created
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={formData.parkingSpacesCreated}
                  onChange={(e) => updateField('parkingSpacesCreated', parseInt(e.target.value))}
                />
              </label>

              <label>
                Expected Daily Occupancy
                <input
                  type="number"
                  min="0"
                  max="10000"
                  value={formData.expectedOccupancy}
                  onChange={(e) => updateField('expectedOccupancy', parseInt(e.target.value))}
                />
              </label>
            </div>
          </section>

          {/* Action Buttons */}
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-submit">
              Analyze Impact
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
