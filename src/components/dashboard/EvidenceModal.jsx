import React from 'react';

const EvidenceModal = ({ selectedEvidence, onClose }) => {
  if (!selectedEvidence) return null;

  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.8)', zIndex: 2000 }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content" style={{ background: 'var(--card-bg)', borderColor: 'var(--border)' }}>
          <div className="modal-header border-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <h6 className="modal-title" style={{ color: 'var(--tx1)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fa-solid fa-image" style={{ color: 'var(--red)' }}></i>
              Violation Evidence
            </h6>
            <button className="btn-close btn-close-white" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            {selectedEvidence.image ? (
              <img src={selectedEvidence.image} alt="Evidence" style={{ width: '100%', borderRadius: '10px', maxHeight: '320px', objectFit: 'contain', background: '#000' }} />
            ) : (
              <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', background: 'var(--card2)', borderRadius: 10 }}>
                <div className="text-center"><i className="fa-solid fa-image-slash fa-2x mb-2"></i><div>No image captured</div></div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
              {[
                { icon: 'fa-clock', label: 'Timestamp', val: selectedEvidence.time },
                { icon: 'fa-location-dot', label: 'Location', val: selectedEvidence.location },
                { icon: 'fa-user', label: 'Person', val: selectedEvidence.name },
                { icon: 'fa-smoking', label: 'Detected', val: selectedEvidence.detected_type || 'unknown' },
              ].map(r => (
                <div key={r.label} style={{ background: 'var(--card2)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: 'var(--tx3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                    <i className={`fa-solid ${r.icon} me-1`}></i>{r.label}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx1)' }}>{r.val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvidenceModal;
