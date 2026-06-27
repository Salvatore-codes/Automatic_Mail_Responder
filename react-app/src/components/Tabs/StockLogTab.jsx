import React, { useState, useEffect } from 'react';
import { History, RotateCw } from 'lucide-react';

export default function StockLogTab({ tenantId, showToast }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/logs?tenant_id=${tenantId}`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (e) {
      showToast('Error loading stock logs: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [tenantId]);

  return (
    <div className="tab-content active" id="content-stocklog">
      <div className="section-card" style={{ position: 'relative' }}>
        <div className="section-header">
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <History style={{ color: 'var(--accent-blue)' }} /> Stock Update Log
            </h2>
            <p className="text-sm text-muted mt-1" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
              Audit trail of all stock quantity changes made via the dashboard.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={loadLogs} disabled={loading}>
            <RotateCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>

        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '50px' }}>#</th>
                <th style={{ width: '180px' }}>SKU ID</th>
                <th>Product Name</th>
                <th style={{ width: '130px' }}>Old Stock</th>
                <th style={{ width: '130px' }}>New Stock</th>
                <th style={{ width: '100px' }}>Change</th>
                <th style={{ width: '200px' }}>Updated At</th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan="7">
                    <div className="empty-state">
                      <div className="es-icon"><RotateCw className="spin" /></div>
                      <h3>Loading log…</h3>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="7">
                    <div className="empty-state">
                      <div className="es-icon"><History style={{ opacity: 0.35 }} /></div>
                      <h3>No stock updates yet</h3>
                      <p>Changes will appear here after you update any SKU stock level.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log, idx) => {
                  const diff = log.new_stock - log.old_stock;
                  const diffLabel = diff > 0
                    ? <span className="pill green">+{diff}</span>
                    : diff < 0
                      ? <span className="pill red">{diff}</span>
                      : <span className="pill gray">No change</span>;

                  const dt = log.updated_at ? new Date(log.updated_at.replace(' ', 'T') + 'Z') : null;
                  const dtStr = dt 
                    ? dt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) 
                    : log.updated_at || '—';

                  return (
                    <tr key={idx}>
                      <td className="text-sm text-muted">{idx + 1}</td>
                      <td><code>{log.sku_id}</code></td>
                      <td><strong>{log.sku_name}</strong></td>
                      <td><span style={{ color: log.old_stock <= 5 ? '#FCD34D' : '#9CA3AF' }}>{log.old_stock} units</span></td>
                      <td>
                        <strong style={{ color: log.new_stock === 0 ? '#F87171' : log.new_stock <= 5 ? '#FCD34D' : '#34D399' }}>
                          {log.new_stock} units
                        </strong>
                      </td>
                      <td>{diffLabel}</td>
                      <td className="text-sm text-muted">{dtStr}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
