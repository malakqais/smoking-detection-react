import React from 'react';

const ViolationsTable = ({
  isStaffUser = false,
  exportCSV,
  searchQuery,
  setSearchQuery,
  locFilter,
  setLocFilter,
  locations,
  filteredViolations,
  setSelectedEvidence,
}) => {
  return (
    <div className="c">
      <div className="c-head">
        <div>
          <div className="c-title"><i className="fa-solid fa-table-list me-2" style={{ color: 'var(--amber)' }}></i>Violation Logs</div>
          <div className="c-sub">Full detection history</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isStaffUser && (
            <button type="button" className="btn-ghost btn-sm" onClick={exportCSV}>
              <i className="fa-solid fa-download me-1"></i>Export CSV
            </button>
          )}
        </div>
      </div>

      <div className="tbl-controls">
        <div className="search-wrap">
          <i className="fa-solid fa-magnifying-glass"></i>
          <input type="text" className="search-input" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <select className="sel-filter" value={locFilter} onChange={e => setLocFilter(e.target.value)}>
          <option value="">All Locations</option>
          {locations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <span className="tbl-count">{filteredViolations.length} records</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr><th>#</th><th>Timestamp</th><th>Location</th><th>Person</th><th>Detected</th><th>Evidence</th></tr>
          </thead>
          <tbody>
            {filteredViolations.length === 0 ? (
              <tr><td colSpan="6" className="text-center py-5 text-muted">No records found</td></tr>
            ) : (
              filteredViolations.map((v, i) => {
                const typeColor = { cigarette: 'var(--red)', smoke: '#94a3b8', vape: 'var(--purple)', unknown: 'var(--tx3)' };
                const typeIcon = { cigarette: 'fa-smoking', smoke: 'fa-wind', vape: 'fa-vial', unknown: 'fa-circle-question' };
                const dt = v.detected_type || 'unknown';
                return (
                  <tr key={v.id} className="fade-in">
                    <td style={{ color: 'var(--tx3)' }}>{i + 1}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{v.time}</td>
                    <td>{v.location}</td>
                    <td>{v.name}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: typeColor[dt] || 'var(--tx3)', background: `${typeColor[dt] || 'var(--tx3)'}18`, padding: '3px 9px', borderRadius: 99 }}>
                        <i className={`fa-solid ${typeIcon[dt] || 'fa-circle-question'}`}></i>
                        {dt}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="btn-r btn-sm" onClick={() => setSelectedEvidence(v)}>
                        <i className="fa-solid fa-image me-1"></i>View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ViolationsTable;
