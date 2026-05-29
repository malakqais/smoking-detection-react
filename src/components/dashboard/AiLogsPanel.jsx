import React from 'react';

const AiLogsPanel = ({ aiLogs, detectionRunning }) => {
  return (
    <div className="c stagger-2" style={{ border: '1px solid var(--border)', background: 'rgba(10,15,30,0.85)', backdropFilter: 'blur(16px)' }}>
      <div className="c-head" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="c-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="fa-solid fa-terminal" style={{ color: 'var(--amber)', textShadow: '0 0 8px rgba(245,158,11,0.4)' }}></i>
          <span style={{ fontFamily: 'monospace', letterSpacing: '0.5px' }}>AI Core Micro-Diagnostics</span>
        </div>
        <span className="tag" style={{ background: detectionRunning ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: detectionRunning ? 'var(--green)' : 'var(--red)', border: `1px solid ${detectionRunning ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, fontSize: '10px' }}>
          <i className={`fa-solid ${detectionRunning ? 'fa-circle-dot fa-pulse' : 'fa-circle'} me-1`} style={{ fontSize: '7px' }}></i>
          {detectionRunning ? 'ACTIVE FLOW' : 'PAUSED'}
        </span>
      </div>
      <div className="c-body" style={{ fontFamily: 'monospace', fontSize: '11px', padding: '16px', height: '240px', background: '#030712', borderRadius: '0 0 16px 16px', overflowY: 'auto', textAlign: 'left' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {aiLogs.map((log, idx) => {
            let color = '#38bdf8';
            if (log.includes('🔴') || log.includes('VIOLATION')) color = 'var(--red)';
            else if (log.includes('🟡') || log.includes('telemetry') || log.includes('Telemetry')) color = 'var(--amber)';
            else if (log.includes('🟢') || log.includes('Stage 1') || log.includes('Stage 2')) color = 'var(--green)';
            return (
              <div key={idx} style={{ color, wordBreak: 'break-all', textShadow: color === 'var(--red)' ? '0 0 4px rgba(239,68,68,0.3)' : 'none', lineHeight: '1.4' }}>
                {log}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AiLogsPanel;
