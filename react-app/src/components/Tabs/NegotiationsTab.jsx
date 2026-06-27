import React, { useState, useEffect } from 'react';
import { MessageSquareText, RotateCw, XCircle, GitPullRequest, Check } from 'lucide-react';

export default function NegotiationsTab({ tenantId, showToast, refreshBadges }) {
  const [negotiations, setNegotiations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Chat Modal state
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatInvoiceId, setChatInvoiceId] = useState('');
  const [chatCustName, setChatCustName] = useState('');
  const [chatLogs, setChatLogs] = useState([]);
  const [loadingChat, setLoadingChat] = useState(false);

  // Resolve Modal state
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [selectedCustName, setSelectedCustName] = useState('');
  const [selectedSubtotal, setSelectedSubtotal] = useState(0);
  const [discountInput, setDiscountInput] = useState(10);

  const fmt = (n) => '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const loadNegotiations = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/negotiations/escalated?tenant_id=${tenantId}`);
      const data = await res.json();
      setNegotiations(data.negotiations || []);
    } catch (e) {
      showToast('Error loading negotiations: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNegotiations();
  }, [tenantId]);

  const openChatHistory = async (invoiceId, custName) => {
    setChatInvoiceId(invoiceId);
    setChatCustName(custName);
    setShowChatModal(true);
    setLoadingChat(true);
    try {
      const res = await fetch(`/api/report/data?tenant_id=${tenantId}`);
      const data = await res.json();
      const logs = (data.logs || {})[invoiceId] || [];
      setChatLogs(logs);
    } catch (e) {
      showToast('Error loading chat history: ' + e.message, 'error');
    } finally {
      setLoadingChat(false);
    }
  };

  const openResolveModal = (invoiceId, custName, subtotal, currentDiscount) => {
    setSelectedInvoiceId(invoiceId);
    setSelectedCustName(custName);
    setSelectedSubtotal(subtotal);
    setDiscountInput(Math.round(currentDiscount * 100));
    setShowResolveModal(true);
  };

  const submitResolution = async (action) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/negotiations/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: selectedInvoiceId,
          action,
          override_discount_pct: parseFloat(discountInput) / 100.0,
          tenant_id: tenantId
        })
      });
      const data = await res.json();
      if (data.status === 'SUCCESS') {
        const icon = action === 'approve' ? '✅' : action === 'reject' ? '✗' : '↔';
        showToast(`${icon} ${data.message}`, 'success');
      } else {
        showToast(data.message || 'Error occurred.', 'info');
      }
      setShowResolveModal(false);
      loadNegotiations();
      refreshBadges();
    } catch (e) {
      showToast('Error resolving negotiation: ' + e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tab-content active" id="content-negotiations">
      <div className="section-card" style={{ position: 'relative' }}>
        <div className="section-header">
          <h2><MessageSquareText /> Escalated Negotiations Desk</h2>
          <button className="btn btn-ghost btn-sm" onClick={loadNegotiations} disabled={loading}>
            <RotateCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
        
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Subtotal</th>
                <th>Current Discount</th>
                <th>Grand Total</th>
                <th>Status</th>
                <th>Created</th>
                <th>Chat History</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && negotiations.length === 0 ? (
                <tr>
                  <td colSpan="9">
                    <div className="empty-state">
                      <div className="es-icon"><RotateCw className="spin" /></div>
                      <h3>Loading negotiations…</h3>
                    </div>
                  </td>
                </tr>
              ) : negotiations.length === 0 ? (
                <tr>
                  <td colSpan="9">
                    <div className="empty-state">
                      <div className="es-icon"><MessageSquareText style={{ opacity: 0.35 }} /></div>
                      <h3>No escalated negotiations</h3>
                      <p>All client discounts and quotes are in normal bounds.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                negotiations.map(n => {
                  const date = n.created_at ? n.created_at.split(' ')[0] : '—';
                  const disc = n.discount_pct ? Math.round(n.discount_pct * 100) + '%' : '0%';
                  const statusLabel = n.status === 'NEGOTIATION_ESCALATED' 
                    ? <span className="pill red">⬆ Escalated</span> 
                    : <span className="pill yellow">💬 Negotiating</span>;
                  return (
                    <tr key={n.invoice_id}>
                      <td><span className="pill blue">{n.invoice_id}</span></td>
                      <td>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{n.customer_name || '—'}</div>
                        <div className="text-sm text-muted">{n.customer_email || ''}</div>
                      </td>
                      <td>{fmt(n.subtotal)}</td>
                      <td><strong style={{ color: '#FCD34D' }}>{disc}</strong></td>
                      <td><strong style={{ color: '#34D399' }}>{fmt(n.grand_total)}</strong></td>
                      <td>{statusLabel}</td>
                      <td className="text-sm text-muted">{date}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => openChatHistory(n.invoice_id, n.customer_name || '')}>
                          💬 View Chat
                        </button>
                      </td>
                      <td>
                        <button className="btn btn-primary btn-sm" onClick={() => openResolveModal(n.invoice_id, n.customer_name || '', n.subtotal, n.discount_pct || 0)}>
                          ⚙️ Resolve
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

      {/* Chat History Modal */}
      {showChatModal && (
        <div className="modal-overlay open">
          <div className="modal-box" style={{ maxWidth: '620px' }}>
            <div className="modal-header">
              <h3>💬 Chat History — {chatInvoiceId} ({chatCustName})</h3>
              <button className="modal-close" onClick={() => setShowChatModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '450px', overflowY: 'auto' }}>
                {loadingChat ? (
                  <div className="empty-state"><h3>Loading chat history…</h3></div>
                ) : chatLogs.length === 0 ? (
                  <div className="empty-state"><h3>No messages logged</h3></div>
                ) : (
                  chatLogs.map((log, i) => {
                    const isUser = log.sender === 'CUSTOMER';
                    return (
                      <div key={i} className={`chat-bubble ${isUser ? 'customer' : 'ai'}`}>
                        <div className="bubble-sender">{isUser ? 'Customer' : 'AI Copilot'}</div>
                        <div>{log.message}</div>
                        <div className="bubble-time">{log.timestamp ? log.timestamp.split(' ')[1] : ''}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowChatModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {showResolveModal && (
        <div className="modal-overlay open">
          <div className="modal-box">
            <div className="modal-header">
              <h3>Resolve Price Negotiation</h3>
              <button className="modal-close" onClick={() => setShowResolveModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="deficit-meta">
                <div className="meta-row"><span>Invoice ID</span><span><code>{selectedInvoiceId}</code></span></div>
                <div className="meta-row"><span>Customer</span><span>{selectedCustName}</span></div>
                <div className="meta-row"><span>Subtotal (Standard)</span><span>{fmt(selectedSubtotal)}</span></div>
              </div>
              <hr className="divider" />
              <p className="text-muted text-sm" style={{ marginBottom: '1rem' }}>Choose an override action. The customer will receive an updated quotation PDF email immediately.</p>
              
              <div className="form-group">
                <label className="form-label">Custom Override Discount %</label>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <input
                    type="number"
                    value={discountInput}
                    onChange={e => setDiscountInput(e.target.value)}
                    className="form-control"
                    style={{ maxWidth: '100px' }}
                    min="0" max="50" step="0.5"
                  />
                  <span className="text-muted text-sm">Set 0 to use standard pricing</span>
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => setShowResolveModal(false)}>Cancel</button>
              <button className="btn btn-danger btn-sm" onClick={() => submitResolution('reject')} disabled={submitting}>
                <XCircle size={12} /> Reject Request
              </button>
              <button className="btn btn-warning btn-sm" onClick={() => submitResolution('counter')} disabled={submitting}>
                <GitPullRequest size={12} /> Counter Offer
              </button>
              <button className="btn btn-success btn-sm" onClick={() => submitResolution('approve')} disabled={submitting}>
                <Check size={12} /> Approve Discount
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
