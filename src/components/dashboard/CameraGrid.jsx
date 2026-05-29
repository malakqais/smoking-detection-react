import React from 'react';

const CameraGrid = ({ activeCams, currentTime, todayCount, detectionRunning }) => {
  return (
    <div className="c mb-4 stagger-3">
      <div className="c-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="hud-radar-scanner" title="Active Radar Zone Sweep"></div>
          <div>
            <div className="c-title"><i className="fa-solid fa-camera me-2" style={{ color: 'var(--blue)' }}></i>AI Surveillance Matrix</div>
            <div className="c-sub">Stage 1 & Stage 2 Pipeline Active</div>
          </div>
        </div>
        <span className={`tag ${detectionRunning ? 'g' : 'r'}`} style={{ boxShadow: detectionRunning ? '0 0 10px rgba(16,185,129,0.3)' : 'none' }}>
          {detectionRunning ? 'ACTIVE SCANNING' : 'SYSTEM IDLE'}
        </span>
      </div>
      <div className="c-body">
        <div className="cam-grid">
          {activeCams.map((cam, i) => (
            <div key={i}>
              <div className="cam-feed">
                {cam.active ? (
                  <>
                    <img
                      src={cam.isWebcam ? `/api/detection/video_feed_user/${encodeURIComponent(cam.userRef)}` : `/api/detection/video_feed/${i}`}
                      alt="Video Feed"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0, zIndex: 0 }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <div className="cf-hud-grid"></div>
                    <div className="cf-hud-crosshair"></div>
                    <div className="cf-hud-telemetry">
                      LATENCY: {(10 + i * 2)}ms<br />
                      FPS: 29.4 | 1080p<br />
                      GPU INFERENCE: 6.2ms<br />
                      STAGE-2: PERSON isol.
                    </div>
                  </>
                ) : (
                  <div className="cf-grid"></div>
                )}
                <div className="scan-line" style={{ animationDelay: `${i * -1.1}s`, animationPlayState: cam.active ? 'running' : 'paused' }}></div>
                <div className="cf-corner tl"></div><div className="cf-corner tr"></div>
                <div className="cf-corner bl"></div><div className="cf-corner br"></div>
                <div className="cf-live">
                  <div className="cf-live-dot" style={{ background: cam.active ? 'var(--red)' : 'var(--tx3)', animation: cam.active ? 'pulse-glow 1.5s infinite' : 'none' }}></div>
                  {cam.active ? 'LIVE FEED' : 'STANDBY'}
                </div>
                <div className="cf-ts">{currentTime}</div>
                {cam.active && todayCount > 0 ? (
                  <div className="cf-no-det" style={{ color: 'var(--red)', opacity: 1, textShadow: '0 0 8px rgba(239,68,68,0.5)' }}>
                    <i className="fa-solid fa-triangle-exclamation fa-beat me-1"></i> {todayCount} today
                  </div>
                ) : (
                  <div className="cf-no-det"><i className="fa-solid fa-shield-check me-1"></i> {cam.active ? 'Clear' : 'Inactive'}</div>
                )}
                <div className="cf-info">
                  <span className="cf-name"><i className="fa-solid fa-location-dot me-1" style={{ color: 'var(--red)' }}></i>{cam.name}</span>
                  <span className="cf-fps" style={{ fontFamily: 'monospace' }}>SEC-{100 + i} | Stage 1 & 2 YOLOv8</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CameraGrid;
