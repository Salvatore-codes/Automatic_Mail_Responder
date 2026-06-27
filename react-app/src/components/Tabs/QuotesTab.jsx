import React, { useState, useEffect } from 'react';
import { FolderOpen, RotateCw, Calendar, User, FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function QuotesTab({ tenantId, showToast, openInventoryModal }) {
  const [quotes, setQuotes] = useState([]);
  const [filteredQuotes, setFilteredQuotes] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [lowStockData, setLowStockData] = useState([]);

  // Chat History Modal State
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatInvoiceId, setChatInvoiceId] = useState('');
  const [chatCustName, setChatCustName] = useState('');
  const [chatLogs, setChatLogs] = useState([]);
  const [loadingChat, setLoadingChat] = useState(false);

  const fmt = (n) => '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const loadQuotes = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/report/data?tenant_id=${tenantId}`);
      const data = await res.json();
      const allQuotes = data.quotations || [];
      setQuotes(allQuotes);
      filterQuotes(searchQuery, allQuotes);
    } catch (e) {
      showToast('Error loading quotations: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadLowStock = async () => {
    try {
      const res = await fetch(`/api/inventory/low-stock?tenant_id=${tenantId}&threshold=5`);
      const data = await res.json();
      setLowStockData(data.items || []);
    } catch (e) { /* silently ignore */ }
  };

  useEffect(() => {
    loadQuotes();
    loadLowStock();
  }, [tenantId]);

  const filterQuotes = (query, list = quotes) => {
    const q = query.toLowerCase().trim();
    if (!q) {
      setFilteredQuotes(list);
      return;
    }
    const filtered = list.filter(qt =>
      (qt.invoice_id || '').toLowerCase().includes(q) ||
      (qt.customer_name || '').toLowerCase().includes(q) ||
      (qt.customer_email || '').toLowerCase().includes(q)
    );
    setFilteredQuotes(filtered);
  };

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    filterQuotes(val);
  };

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

  const statusMap = {
    'QUOTE_GENERATED': { cls: 'generated', label: 'Quote Sent', pillClass: 'pill blue' },
    'QUOTE_UPDATED': { cls: 'generated', label: 'Updated', pillClass: 'pill blue' },
    'NEGOTIATION_ESCALATED': { cls: 'escalated', label: 'Escalated', pillClass: 'pill red' },
    'NEGOTIATION_NEGOTIATING': { cls: 'escalated', label: 'Negotiating', pillClass: 'pill yellow' },
    'NEGOTIATION_APPROVED': { cls: 'approved', label: 'Approved', pillClass: 'pill green' },
    'NEGOTIATION_REJECTED': { cls: 'rejected', label: 'Rejected', pillClass: 'pill gray' },
  };

  return (
    <div className="tab-content active" id="content-quotes">
      
      {/* Low Stock Warning Section */}
      <div className="section-card" style={{ marginBottom: '1.5rem' }}>
        <div className="section-header">
          <h2><AlertTriangle /> Live Inventory — Low Stock Warning</h2>
          <button className="btn btn-ghost btn-sm" onClick={loadLowStock}>
            <RotateCw size={14} /> Refresh
          </button>
        </div>
        <div className="section-body" style={{ padding: '1.25rem 1.75rem' }}>
          {lowStockData.length === 0 ? (
            <div className="empty-state" style={{ padding: '1.5rem 0' }}>
              <div className="es-icon"><CheckCircle2 style={{ color: '#10B981', opacity: 0.35 }} /></div>
              <h3>All Good</h3>
              <p>No SKUs are below the 5-unit threshold.</p>
            </div>
          ) : (
            lowStockData.map(sku => {
              const isZero = sku.stock === 0;
              return (
                <div key={sku.sku_id} className="inventory-card" style={{ borderLeft: isZero ? '4px solid var(--accent-red)' : '4px solid var(--accent-yellow)' }}>
                  <div className={`inv-stock-badge ${isZero ? 'zero' : ''}`}>
                    <div className="stock-num">{sku.stock}</div>
                    <div className="stock-label">units</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{sku.sku_name}</div>
                    <div className="text-sm text-muted" style={{ marginTop: '0.15rem' }}><code>{sku.sku_id}</code> · {sku.category}</div>
                    <div className="text-sm" style={{ color: '#A5B4FC', marginTop: '0.2rem' }}>{fmt(sku.price)} / unit</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {isZero ? <span className="pill red">Out of Stock</span> : <span className="pill yellow">Low Stock</span>}
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => openInventoryModal(sku.sku_id, sku.sku_name, sku.stock, () => { loadLowStock(); loadQuotes(); })}
                    >
                      Update Stock
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Quote grid repository */}
      <div className="section-card" style={{ position: 'relative' }}>
        <div className="section-header">
          <h2><FolderOpen /> Quotation Repository</h2>
          <div className="gap-row">
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              className="form-control"
              style={{ width: '240px', padding: '0.45rem 1rem', fontSize: '0.8rem' }}
              placeholder="Search by customer or invoice…"
            />
            <button className="btn btn-ghost btn-sm" onClick={loadQuotes} disabled={loading}>
              <RotateCw size={14} className={loading ? 'spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        <div className="section-body">
          {loading && quotes.length === 0 ? (
            <div className="empty-state">
              <div className="es-icon"><RotateCw className="spin" /></div>
              <h3>Loading quotes…</h3>
            </div>
          ) : filteredQuotes.length === 0 ? (
            <div className="empty-state" style={{ gridColumn: '1/-1' }}>
              <div className="es-icon"><FolderOpen style={{ opacity: 0.35 }} /></div>
              <h3>No quotes found</h3>
              <p>Process an order from the simulator to generate the first quotation.</p>
            </div>
          ) : (
            <div className="quote-grid">
              {filteredQuotes.map(q => {
                const sm = statusMap[q.status] || { cls: 'generated', label: q.status, pillClass: 'pill gray' };
                const date = q.created_at ? q.created_at.split(' ')[0] : '—';
                const hasDiscount = q.discount_pct > 0;
                
                return (
                  <div key={q.invoice_id} className={`quote-card ${sm.cls}`} onClick={() => openChatHistory(q.invoice_id, q.customer_name || '')}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                      <h3>{q.invoice_id}</h3>
                      <span className={sm.pillClass}>{sm.label}</span>
                    </div>
                    <div className="qc-customer">
                      <User size={12} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} /> 
                      {q.customer_name || '—'} &nbsp;·&nbsp; {q.customer_email || ''}
                    </div>
                    <div className="qc-total">{fmt(q.grand_total)}</div>
                    <div className="qc-footer">
                      <span className="qc-date">
                        <Calendar size={12} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} /> 
                        {date}
                      </span>
                      {hasDiscount && (
                        <span className="pill yellow">{Math.round(q.discount_pct * 100)}% off</span>
                      )}
                    </div>
                    
                    <a
                      href={`/api/quote/pdf/${q.invoice_id}?tenant_id=${tenantId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: '0.75rem' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <FileText size={12} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} /> 
                      View PDF
                    </a>
                  </div>
                );
              })}
            </div>
          )}
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

    </div>
  );
}
