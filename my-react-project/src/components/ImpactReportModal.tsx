/**
 * Impact Report Modal - Displays comprehensive construction impact analysis
 */

import React from 'react';
import type { ImpactAnalysis } from '../types/building';
import './ImpactReportModal.css';

interface ImpactReportModalProps {
  analysis: ImpactAnalysis;
  onClose: () => void;
}

export const ImpactReportModal: React.FC<ImpactReportModalProps> = ({
  analysis,
  onClose,
}) => {
  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low':
        return '#28a745';
      case 'medium':
        return '#ffc107';
      case 'high':
        return '#fd7e14';
      case 'critical':
        return '#dc3545';
      default:
        return '#6c757d';
    }
  };

  const getComplianceColor = (status: string) => {
    if (status === 'compliant') return '#28a745';
    if (status === 'non-compliant') return '#dc3545';
    return '#ffc107';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="report-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="report-header">
          <div>
            <h2>Construction Impact Analysis</h2>
            <div className="risk-badge" style={{ backgroundColor: getRiskColor(analysis.overall.riskLevel) }}>
              {analysis.overall.riskLevel.toUpperCase()} RISK
            </div>
          </div>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="report-body">
          {/* Overall Summary */}
          <section className="report-section">
            <h3>Executive Summary</h3>
            <div className="summary-grid">
              <div className="summary-card">
                <div className="summary-label">Risk Level</div>
                <div className="summary-value" style={{ color: getRiskColor(analysis.overall.riskLevel) }}>
                  {analysis.overall.riskLevel}
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-label">Severity Score</div>
                <div className="summary-value">{analysis.overall.severity}/10</div>
              </div>
              <div className="summary-card">
                <div className="summary-label">Economic Impact</div>
                <div className="summary-value">{analysis.economic.businessImpact}</div>
              </div>
            </div>
            <p className="narrative">{analysis.narrative}</p>
          </section>

          {/* Traffic Impact */}
          <section className="report-section">
            <h3>🚗 Traffic Impact</h3>
            <div className="impact-details">
              <div className="detail-row">
                <span className="detail-label">Peak Hour Delay:</span>
                <span className="detail-value">{analysis.trafficCongestion.peakHourDelay} minutes</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Average Delay:</span>
                <span className="detail-value">{analysis.trafficCongestion.averageDelay} minutes</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Detour Required:</span>
                <span className="detail-value">{analysis.trafficCongestion.detourRequired ? 'Yes' : 'No'}</span>
              </div>
            </div>
            {analysis.trafficCongestion.affectedRoutes.length > 0 && (
              <div>
                <p className="subsection-title">Affected Routes:</p>
                <ul className="route-list">
                  {analysis.trafficCongestion.affectedRoutes.map((route, idx) => (
                    <li key={idx}>{route}</li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.trafficCongestion.transitRoutesAffected.length > 0 && (
              <div>
                <p className="subsection-title">Transit Routes Affected:</p>
                <ul className="route-list">
                  {analysis.trafficCongestion.transitRoutesAffected.map((route, idx) => (
                    <li key={idx}>{route}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Environmental Impact */}
          <section className="report-section">
            <h3>🌿 Environmental Impact</h3>

            <div className="subsection">
              <p className="subsection-title">Air Quality</p>
              <div className="impact-details">
                <div className="detail-row">
                  <span className="detail-label">PM10 Increase:</span>
                  <span className="detail-value">{analysis.environmental.airQuality.pm10Increase} μg/m³</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">PM2.5 Increase:</span>
                  <span className="detail-value">{analysis.environmental.airQuality.pm25Increase} μg/m³</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Compliance Status:</span>
                  <span
                    className="status-badge"
                    style={{ backgroundColor: getComplianceColor(analysis.environmental.airQuality.complianceStatus) }}
                  >
                    {analysis.environmental.airQuality.complianceStatus}
                  </span>
                </div>
              </div>
            </div>

            <div className="subsection">
              <p className="subsection-title">Noise</p>
              <div className="impact-details">
                <div className="detail-row">
                  <span className="detail-label">Peak Level:</span>
                  <span className="detail-value">{analysis.environmental.noise.peakLevel} dB</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Exceeds Limits:</span>
                  <span className="detail-value">{analysis.environmental.noise.exceedsLimits ? 'Yes' : 'No'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Affected Residents:</span>
                  <span className="detail-value">{analysis.environmental.noise.affectedResidents}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Mitigation Required:</span>
                  <span className="detail-value">{analysis.environmental.noise.mitigationRequired ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </div>

            <div className="subsection">
              <p className="subsection-title">Dust Control</p>
              <div className="impact-details">
                <div className="detail-row">
                  <span className="detail-label">Dust Level:</span>
                  <span className="detail-value">{analysis.environmental.dust.level}</span>
                </div>
              </div>
              {analysis.environmental.dust.controlMeasuresRequired.length > 0 && (
                <ul className="measures-list">
                  {analysis.environmental.dust.controlMeasuresRequired.map((measure, idx) => (
                    <li key={idx}>{measure}</li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Economic Impact */}
          <section className="report-section">
            <h3>💰 Economic Impact</h3>
            <div className="impact-details">
              <div className="detail-row">
                <span className="detail-label">Business Impact:</span>
                <span className="detail-value">{analysis.economic.businessImpact}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Estimated Revenue Loss:</span>
                <span className="detail-value">${analysis.economic.estimatedRevenueLoss.toLocaleString()}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Affected Businesses:</span>
                <span className="detail-value">{analysis.economic.affectedBusinesses}</span>
              </div>
            </div>
          </section>

          {/* Compliance Requirements */}
          <section className="report-section">
            <h3>📋 Regulatory Compliance</h3>

            <div className="subsection">
              <p className="subsection-title">Required Permits</p>
              <ul className="permits-list">
                {analysis.compliance.requiredPermits.map((permit, idx) => (
                  <li key={idx}>{permit}</li>
                ))}
              </ul>
            </div>

            <div className="subsection">
              <p className="subsection-title">Required Plans & Assessments</p>
              <div className="impact-details">
                <div className="detail-row">
                  <span className="detail-label">Traffic Management Plan:</span>
                  <span className="detail-value">{analysis.compliance.trafficManagementPlanRequired ? 'Required' : 'Not Required'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Environmental Assessment:</span>
                  <span className="detail-value">{analysis.compliance.environmentalAssessmentRequired ? 'Required' : 'Not Required'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Community Consultation:</span>
                  <span className="detail-value">{analysis.compliance.communityConsultationRequired ? 'Required' : 'Not Required'}</span>
                </div>
              </div>
            </div>

            <div className="subsection">
              <p className="subsection-title">Mitigation Measures</p>
              <ul className="mitigation-list">
                {analysis.compliance.mitigationMeasures.map((measure, idx) => (
                  <li key={idx}>{measure}</li>
                ))}
              </ul>
            </div>
          </section>

          {/* Recommended Actions */}
          <section className="report-section">
            <h3>✓ Recommended Actions</h3>
            <ol className="actions-list">
              {analysis.overall.recommendedActions.map((action, idx) => (
                <li key={idx}>{action}</li>
              ))}
            </ol>
          </section>

          {/* Sources */}
          {analysis.sources && analysis.sources.length > 0 && (
            <section className="report-section sources">
              <h3>📚 Sources</h3>
              <ul className="sources-list">
                {analysis.sources.map((source, idx) => (
                  <li key={idx}>
                    <strong>{source.document}</strong>
                    {source.relevance && <span className="relevance"> - {source.relevance}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="report-footer">
          <button className="btn-close" onClick={onClose}>
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
};
