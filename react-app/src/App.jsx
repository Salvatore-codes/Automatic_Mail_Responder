import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import SimulatorTab from './components/Tabs/SimulatorTab';
import DeficitsTab from './components/Tabs/DeficitsTab';
import NegotiationsTab from './components/Tabs/NegotiationsTab';
import QuotesTab from './components/Tabs/QuotesTab';
import InventoryTab from './components/Tabs/InventoryTab';
import StockLogTab from './components/Tabs/StockLogTab';
import { Save } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('simulator');
  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState('default');
  
  // Badge counts
  const [deficitsCount, setDeficitsCount] = useState(0);
  const [negsCount, setNegsCount] = useState(0);

  // Toast notifications state
  const [toast, setToast] = useState(null);

  // Shared Inventory Update Modal state
  const [showInvModal, setShowInvModal] = useState(false);
  const [invModalSkuId, setInvModalSkuId] = useState('');
  const [invModalSkuName, setInvModalSkuName] = useState('');
  const [invModalStock, setInvModalStock] = useState(0);
  const [invModalCallback, setInvModalCallback] = useState(null);
  const [savingStock, setSavingStock] = useState(false);

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const loadTenants = async () => {
    try {
      const res = await fetch('/api/tenants');
      const data = await res.json();
      setTenants(data || []);
    } catch (e) {
      showToast('Error loading tenants list.', 'error');
    }
  };

  const refreshBadges = async () => {
    try {
      const [defRes, negRes] = await Promise.all([
        fetch(`/api/deficits?tenant_id=${selectedTenant}`),
        fetch(`/api/negotiations/escalated?tenant_id=${selectedTenant}`)
      ]);
      const defData = await defRes.json();
      const negData = await negRes.json();
      
      const pending = (defData.deficits || []).filter(d => d.status === 'PENDING').length;
      const negs = negData.count || 0;
      
      setDeficitsCount(pending);
      setNegsCount(negs);
    } catch (e) { /* silently ignore badge load failure */ }
  };

  useEffect(() => {
    loadTenants();
  }, []);

  useEffect(() => {
    refreshBadges();
    // Setup background poller
    const interval = setInterval(refreshBadges, 8000);
    return () => clearInterval(interval);
  }, [selectedTenant]);

  const openInventoryModal = (skuId, skuName, currentStock, callback) => {
    setInvModalSkuId(skuId);
    setInvModalSkuName(skuName);
    setInvModalStock(currentStock);
    setInvModalCallback(() => callback);
    setShowInvModal(true);
  };

  const handleSaveStock = async () => {
    setSavingStock(true);
    try {
      const res = await fetch('/api/inventory/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku_id: invModalSkuId,
          new_stock: parseInt(invModalStock),
          tenant_id: selectedTenant
        })
      });
      const data = await res.json();
      if (data.status === 'SUCCESS') {
        showToast('Stock level updated successfully!', 'success');
        setShowInvModal(false);
        if (invModalCallback) invModalCallback();
        refreshBadges();
      } else {
        showToast(data.message || 'Error updating stock level.', 'error');
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    } finally {
      setSavingStock(false);
    }
  };

  const pageTitles = {
    'simulator': 'Live Simulator',
    'deficits': 'Deficits Manager',
    'negotiations': 'Price Negotiations Desk',
    'quotes': 'Quotation Repository',
    'inventory': 'Full Catalog Inventory',
    'stocklog': 'Stock Update Audit Log'
  };

  return (
    <div className="app-shell">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        deficitsCount={deficitsCount}
        negsCount={negsCount}
      />

      {/* Main Container */}
      <div className="main-container">
        
        {/* Header */}
        <header className="main-header">
          <div className="header-title">
            <h2>{pageTitles[activeTab] || 'Dashboard'}</h2>
          </div>
          <div className="nav-controls">
            <select
              className="tenant-selector"
              value={selectedTenant}
              onChange={e => setSelectedTenant(e.target.value)}
            >
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <div className="live-indicator">
              <div className="live-dot"></div>
              Connected
            </div>
          </div>
        </header>

        {/* Tab Content Panels */}
        <main style={{ flex: 1, overflowY: 'auto' }}>
          {activeTab === 'simulator' && (
            <SimulatorTab
              tenantId={selectedTenant}
              showToast={showToast}
              refreshBadges={refreshBadges}
            />
          )}
          {activeTab === 'deficits' && (
            <DeficitsTab
              tenantId={selectedTenant}
              showToast={showToast}
              refreshBadges={refreshBadges}
            />
          )}
          {activeTab === 'negotiations' && (
            <NegotiationsTab
              tenantId={selectedTenant}
              showToast={showToast}
              refreshBadges={refreshBadges}
            />
          )}
          {activeTab === 'quotes' && (
            <QuotesTab
              tenantId={selectedTenant}
              showToast={showToast}
              openInventoryModal={openInventoryModal}
            />
          )}
          {activeTab === 'inventory' && (
            <InventoryTab
              tenantId={selectedTenant}
              showToast={showToast}
              openInventoryModal={openInventoryModal}
            />
          )}
          {activeTab === 'stocklog' && (
            <StockLogTab
              tenantId={selectedTenant}
              showToast={showToast}
            />
          )}
        </main>
      </div>

      {/* Toast Messages Manager */}
      {toast && (
        <div id="toast-container">
          <div className={`toast ${toast.type}`}>
            <span className="toast-msg">{toast.msg}</span>
          </div>
        </div>
      )}

      {/* Shared Inventory Update Modal */}
      {showInvModal && (
        <div className="modal-overlay open">
          <div className="modal-box">
            <div className="modal-header">
              <h3>✏️ Update Stock Quantity</h3>
              <button className="modal-close" onClick={() => setShowInvModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="deficit-meta">
                <div className="meta-row"><span>SKU ID</span><span><code>{invModalSkuId}</code></span></div>
                <div className="meta-row"><span>Product</span><span>{invModalSkuName}</span></div>
              </div>
              <hr className="divider" />
              
              <div className="form-group">
                <label className="form-label">New Stock Level (On-Hand)</label>
                <input
                  type="number"
                  value={invModalStock}
                  onChange={e => setInvModalStock(e.target.value)}
                  className="form-control"
                  min="0"
                  placeholder="Enter new stock level…"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveStock();
                    }
                  }}
                />
                <p className="text-muted text-sm mt-1">This will update the catalog stock level on disk immediately.</p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowInvModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveStock} disabled={savingStock}>
                {savingStock ? <div className="spinner"></div> : <Save size={14} />} 
                {savingStock ? 'Saving...' : 'Save Stock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
