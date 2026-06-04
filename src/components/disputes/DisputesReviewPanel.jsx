import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../utils/api.js';
import {
  canDecideDisputes,
  canReviewDisputesAsManager,
  canVoteDisputes,
  isAdmin,
  isManager,
  isSupervisor,
} from '../../utils/roles.js';

const STATUS = {
  pending_manager: { label: 'Awaiting manager', tag: 'a' },
  pending_admin: { label: 'Admin voting', tag: 'p' },
  awaiting_supervisor: { label: 'Supervisor decision', tag: 'r' },
  approved: { label: 'Approved — violation removed', tag: 'g' },
  rejected: { label: 'Rejected — violation kept', tag: 'b' },
};

const REASON_LABELS = {
  not_smoking: 'Not smoking',
  wrong_item: 'Misidentified object',
  wrong_person: 'Wrong person',
  poor_quality: 'Poor image',
  wrong_location: 'Wrong location',
  other: 'Other',
};

function VoteTable({ roster }) {
  if (!roster?.length) {
    return <p className="dispute-muted">No admins configured to vote.</p>;
  }
  return (
    <table className="tbl dispute-vote-tbl">
      <thead>
        <tr>
          <th>Admin</th>
          <th>Vote</th>
          <th>When</th>
        </tr>
      </thead>
      <tbody>
        {roster.map((a) => (
          <tr key={a.admin_id}>
            <td>{a.admin_name}</td>
            <td>
              {a.vote === 'valid' && <span className="tag g">Yes — mistake</span>}
              {a.vote === 'invalid' && <span className="tag r">No — stands</span>}
              {!a.vote && <span className="tag b">Pending</span>}
            </td>
            <td style={{ fontSize: 11, color: 'var(--tx3)' }}>{a.voted_at || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function DisputesReviewPanel({
  user,
  actionGrantToken,
  totpVerified,
  onNeedTotp,
  defaultTotpCode = '',
}) {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState({});
  const [totpCodes, setTotpCodes] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState('open');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/disputes');
      if (res.ok) setDisputes(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = disputes.filter((d) => {
    if (filter === 'open') return !['approved', 'rejected'].includes(d.status);
    if (filter === 'closed') return ['approved', 'rejected'].includes(d.status);
    return true;
  });

  const managerReview = async (disputeId, decision) => {
    const code = totpCodes[disputeId] || defaultTotpCode;
    if (isManager(user) && !code) {
      onNeedTotp?.('Enter your 6-digit 2FA code to confirm this action.');
      return;
    }
    if (isSupervisor(user) && !totpVerified && !actionGrantToken && decision === 'remove') {
      onNeedTotp?.('Verify your supervisor code first.');
      return;
    }
    setBusyId(disputeId);
    try {
      const res = await apiFetch(`/api/disputes/${disputeId}/manager-review`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          note: notes[disputeId] || '',
          totp_code: code || undefined,
          action_grant_token: actionGrantToken || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.dispute) {
        setDisputes((prev) => prev.map((d) => (d.id === disputeId ? data.dispute : d)));
      }
    } finally {
      setBusyId(null);
    }
  };

  const vote = async (disputeId, voteValue) => {
    setBusyId(disputeId);
    try {
      const res = await apiFetch(`/api/disputes/${disputeId}/vote`, {
        method: 'POST',
        body: JSON.stringify({ vote: voteValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.dispute) {
        setDisputes((prev) => prev.map((d) => (d.id === disputeId ? data.dispute : d)));
      }
    } finally {
      setBusyId(null);
    }
  };

  const decide = async (disputeId, decision) => {
    if (!totpVerified && !actionGrantToken) {
      onNeedTotp?.('Verify your 6-digit supervisor code first.');
      return;
    }
    setBusyId(disputeId);
    try {
      const res = await apiFetch(`/api/disputes/${disputeId}/decide`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          note: notes[disputeId] || '',
          action_grant_token: actionGrantToken || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.dispute) {
        setDisputes((prev) => prev.map((d) => (d.id === disputeId ? data.dispute : d)));
      }
    } finally {
      setBusyId(null);
    }
  };

  const openCount = disputes.filter((d) => !['approved', 'rejected'].includes(d.status)).length;

  return (
    <div className="c mt-4">
      <div className="c-head">
        <div>
          <div className="c-title">
            <i className="fa-solid fa-scale-balanced me-2" style={{ color: 'var(--amber)' }}></i>
            Violation dispute queue
          </div>
          <div className="c-sub">
            User → Manager review → Admin votes (yes/no) → Supervisor final decision
            {openCount > 0 && <span className="tag r ms-2">{openCount} open</span>}
          </div>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          {['open', 'closed', 'all'].map((f) => (
            <button
              key={f}
              type="button"
              className={`btn-ghost btn-sm ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <button type="button" className="btn-ghost btn-sm" onClick={load}>
            <i className="fa-solid fa-rotate-right"></i>
          </button>
        </div>
      </div>
      <div className="c-body">
        {loading ? (
          <div className="text-center py-4 text-muted">Loading disputes…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-4 text-muted">No disputes in this view.</div>
        ) : (
          <div className="dispute-list">
            {filtered.map((d) => {
              const st = STATUS[d.status] || { label: d.status, tag: 'b' };
              const myVote = isAdmin(user) ? d.votes?.find((v) => v.admin_id === user.id) : null;
              return (
                <div key={d.id} className="dispute-card">
                  <div className="dispute-card-head">
                    <div>
                      <strong>Dispute #{d.id}</strong>
                      <span className="text-muted ms-2">Violation #{d.violation_id}</span>
                      <div className="dispute-meta">
                        {d.user_name} · {d.v_timestamp} · {d.v_location}
                      </div>
                    </div>
                    <span className={`tag ${st.tag}`}>{st.label}</span>
                  </div>

                  <div className="dispute-grid">
                    <div>
                      <div className="dispute-section-title">User report</div>
                      <p className="dispute-muted">
                        Reasons: {(d.reasons || []).map((r) => REASON_LABELS[r] || r).join(', ') || '—'}
                      </p>
                      {d.user_note && <p className="dispute-muted">Note: {d.user_note}</p>}
                      {d.v_image_url && (
                        <a href={d.v_image_url} target="_blank" rel="noreferrer" className="btn-ghost btn-sm mt-1">
                          <i className="fa-solid fa-image me-1"></i>View evidence
                        </a>
                      )}
                    </div>
                    <div>
                      <div className="dispute-section-title">Workflow</div>
                      <ul className="dispute-timeline">
                        <li className={d.status !== 'pending_manager' ? 'done' : 'active'}>
                          <strong>1. Manager</strong>
                          {d.manager_reviewer_name ? (
                            <span> — {d.manager_reviewer_name}: {d.manager_decision} {d.manager_reviewed_at && `(${d.manager_reviewed_at})`}</span>
                          ) : (
                            <span> — pending</span>
                          )}
                        </li>
                        <li className={['pending_admin', 'awaiting_supervisor', 'approved', 'rejected'].includes(d.status) && d.status !== 'pending_manager' ? 'done' : d.status === 'pending_admin' ? 'active' : ''}>
                          <strong>2. Admins</strong>
                          <span> — {d.admin_voted || 0}/{d.admin_total || 0} voted</span>
                        </li>
                        <li className={d.status === 'awaiting_supervisor' ? 'active' : ['approved', 'rejected'].includes(d.status) ? 'done' : ''}>
                          <strong>3. Supervisor</strong>
                          {d.supervisor_note ? <span> — {d.supervisor_note}</span> : <span> — final call</span>}
                        </li>
                      </ul>
                    </div>
                  </div>

                  {(d.admin_roster?.length > 0 || d.votes?.length > 0) && (
                    <div className="mt-3">
                      <div className="dispute-section-title">Admin votes (yes = mistake, no = violation stands)</div>
                      <VoteTable roster={d.admin_roster} />
                      <p className="dispute-muted mt-1">
                        Summary: {d.votes_valid || 0} yes · {d.votes_invalid || 0} no
                      </p>
                    </div>
                  )}

                  {canReviewDisputesAsManager(user) && d.status === 'pending_manager' && (
                    <div className="dispute-actions mt-3">
                      <textarea
                        className="finput mb-2"
                        rows={2}
                        placeholder="Manager note (optional)"
                        value={notes[d.id] || ''}
                        onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                      />
                      {isManager(user) && (
                        <input
                          className="finput mb-2 supervisor-totp-input"
                          placeholder="Your 6-digit 2FA code"
                          maxLength={6}
                          value={totpCodes[d.id] || ''}
                          onChange={(e) => setTotpCodes((c) => ({ ...c, [d.id]: e.target.value.replace(/\D/g, '') }))}
                        />
                      )}
                      <div className="d-flex gap-2 flex-wrap">
                        <button type="button" className="btn-r btn-sm" disabled={busyId === d.id} onClick={() => managerReview(d.id, 'remove')}>
                          Confirm mistake — remove violation
                        </button>
                        <button type="button" className="btn-ghost btn-sm" disabled={busyId === d.id} onClick={() => managerReview(d.id, 'escalate')}>
                          Escalate to admins
                        </button>
                        <button type="button" className="btn-danger-outline btn-sm" disabled={busyId === d.id} onClick={() => managerReview(d.id, 'reject')}>
                          Reject report
                        </button>
                      </div>
                    </div>
                  )}

                  {canVoteDisputes(user) && d.status === 'pending_admin' && (
                    <div className="dispute-actions mt-3">
                      {myVote ? (
                        <span className="tag b">Your vote: {myVote.vote === 'valid' ? 'Yes — mistake' : 'No — stands'}</span>
                      ) : (
                        <div className="d-flex gap-2 flex-wrap">
                          <button type="button" className="btn-ghost btn-sm" disabled={busyId === d.id} onClick={() => vote(d.id, 'valid')}>
                            Yes — likely a mistake
                          </button>
                          <button type="button" className="btn-danger-outline btn-sm" disabled={busyId === d.id} onClick={() => vote(d.id, 'invalid')}>
                            No — violation stands
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {canDecideDisputes(user) && d.status === 'awaiting_supervisor' && (
                    <div className="dispute-actions mt-3">
                      <textarea
                        className="finput mb-2"
                        rows={2}
                        placeholder="Supervisor note (optional)"
                        value={notes[d.id] || ''}
                        onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                      />
                      <div className="d-flex gap-2 flex-wrap">
                        <button type="button" className="btn-r btn-sm" disabled={busyId === d.id || !totpVerified} onClick={() => decide(d.id, 'approve')}>
                          Approve — remove violation
                        </button>
                        <button type="button" className="btn-ghost btn-sm" disabled={busyId === d.id || !totpVerified} onClick={() => decide(d.id, 'reject')}>
                          Reject dispute
                        </button>
                      </div>
                      {!totpVerified && (
                        <p className="dispute-muted mt-2">Unlock the supervisor console with your 6-digit code first.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function UserDisputesPanel({ disputes, onReport, loading }) {
  if (loading) {
    return <div className="text-center py-3 text-muted">Loading your dispute requests…</div>;
  }
  if (!disputes?.length) {
    return (
      <p className="dispute-muted mb-0">
        No dispute requests yet. Use <strong>Report mistake</strong> on a violation ticket below.
      </p>
    );
  }
  return (
    <div className="dispute-list">
      {disputes.map((d) => {
        const st = STATUS[d.status] || { label: d.status, tag: 'b' };
        return (
          <div key={d.id} className="dispute-card dispute-card--compact">
            <div className="dispute-card-head">
              <div>
                <strong>Violation #{d.violation_id}</strong>
                <div className="dispute-meta">{d.v_timestamp} · {d.v_location}</div>
              </div>
              <span className={`tag ${st.tag}`}>{st.label}</span>
            </div>
            <ul className="dispute-timeline dispute-timeline--compact">
              <li className={d.status !== 'pending_manager' ? 'done' : 'active'}>
                Manager {d.manager_reviewer_name ? `(${d.manager_reviewer_name}: ${d.manager_decision})` : '— reviewing'}
              </li>
              <li className={d.status === 'pending_admin' ? 'active' : d.admin_voted ? 'done' : ''}>
                Admins voting ({d.admin_voted || 0}/{d.admin_total || 0})
              </li>
              <li className={d.status === 'awaiting_supervisor' ? 'active' : ['approved', 'rejected'].includes(d.status) ? 'done' : ''}>
                Supervisor decision
              </li>
            </ul>
            {d.admin_roster?.length > 0 && (
              <div className="mt-2">
                <VoteTable roster={d.admin_roster} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
