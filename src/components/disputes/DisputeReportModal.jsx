import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../utils/api.js';

export default function DisputeReportModal({ violation, onClose, onSubmitted }) {
  const [reasons, setReasons] = useState([]);
  const [options, setOptions] = useState([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/disputes/reasons')
      .then((r) => (r.ok ? r.json() : []))
      .then(setOptions)
      .catch(() => setOptions([]));
  }, []);

  const toggle = (id) => {
    setReasons((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!reasons.length) {
      setError('Select at least one reason');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/disputes', {
        method: 'POST',
        body: JSON.stringify({
          violation_id: violation.id,
          reasons,
          note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onSubmitted?.(data);
        onClose();
      } else {
        setError(data.message || 'Could not submit dispute');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  if (!violation) return null;

  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.75)', zIndex: 2000 }} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="modal-header border-0">
          <h6 className="modal-title" style={{ color: 'var(--tx1)' }}>
            <i className="fa-solid fa-flag me-2" style={{ color: 'var(--amber)' }}></i>Report a mistake
          </h6>
          <button type="button" className="btn-close btn-close-white" onClick={onClose} aria-label="Close"></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--tx2)', marginBottom: 12 }}>
            Violation #{violation.id} · {violation.time} · {violation.location}
          </p>
          <p style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 16 }}>
            A manager will review first, then all admins vote yes/no, then the supervisor decides.
          </p>
          <div className="dispute-reason-list">
            {options.map((opt) => (
              <label key={opt.id} className="dispute-reason-item">
                <input
                  type="checkbox"
                  checked={reasons.includes(opt.id)}
                  onChange={() => toggle(opt.id)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          <div className="fgroup mt-3">
            <label className="flabel">Additional note (optional)</label>
            <textarea className="finput" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && <div className="error-msg show mt-2"><span>{error}</span></div>}
          <div className="d-flex gap-2 mt-3 justify-content-end">
            <button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-r btn-sm" onClick={submit} disabled={loading}>
              {loading ? 'Submitting…' : 'Submit dispute'}
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
