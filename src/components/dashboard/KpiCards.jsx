import React from 'react';

const KpiCards = ({ todayCount, totalViolations, detectionRunning }) => {
  return (
    <div className="kpi-grid mb-4 stagger-1">
      <div className="kpi r">
        <div className="kpi-icon"><i className="fa-solid fa-triangle-exclamation"></i></div>
        <div className="kpi-val">{todayCount}</div>
        <div className="kpi-lbl">Today's Violations</div>
      </div>
      <div className="kpi a">
        <div className="kpi-icon"><i className="fa-solid fa-calendar-week"></i></div>
        <div className="kpi-val">{totalViolations}</div>
        <div className="kpi-lbl">Total Violations</div>
      </div>
      <div className="kpi g">
        <div className="kpi-icon"><i className="fa-solid fa-crosshairs"></i></div>
        <div className="kpi-val" style={{ fontSize: '20px', color: 'var(--amber)' }} title="End-to-end system accuracy has not been benchmarked yet">
          N/A
        </div>
        <div className="kpi-lbl">Accuracy (Not Benchmarked)</div>
      </div>
      <div className="kpi b">
        <div className="kpi-icon"><i className="fa-solid fa-video"></i></div>
        <div className="kpi-val" style={{ color: detectionRunning ? 'var(--green)' : 'var(--tx3)' }}>
          {detectionRunning ? 'Active' : 'Off'}
        </div>
        <div className="kpi-lbl">Detection Status</div>
      </div>
    </div>
  );
};

export default KpiCards;
