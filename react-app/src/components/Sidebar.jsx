import React from 'react';
import { Zap, Package, MessageSquareText, FolderOpen, Warehouse, History } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, deficitsCount, negsCount }) {
  const tabs = [
    { id: 'simulator', label: 'Live Simulator', icon: Zap, badge: null },
    { id: 'deficits', label: 'Deficits', icon: Package, badge: deficitsCount, badgeColor: 'red' },
    { id: 'negotiations', label: 'Negotiations', icon: MessageSquareText, badge: negsCount, badgeColor: 'yellow' },
    { id: 'quotes', label: 'Quote Repository', icon: FolderOpen, badge: null },
    { id: 'inventory', label: 'Full Inventory', icon: Warehouse, badge: null },
    { id: 'stocklog', label: 'Stock Update Log', icon: History, badge: null }
  ];

  return (
    <aside className="sidebar-nav">
      <div className="nav-brand" style={{ marginBottom: '2.25rem', padding: '0.5rem 0.75rem', background: '#FFFFFF', borderRadius: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
        <img src="/static/logo.png" alt="Trofeo Solution" style={{ maxWidth: '100%', height: 'auto', maxHeight: '40px', objectFit: 'contain' }} />
      </div>
      
      <div className="nav-tabs">
        {tabs.map(tab => {
          const IconComponent = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              className={`nav-tab ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <IconComponent className="nav-icon" />
              {tab.label}
              {tab.badge ? (
                <span className={`tab-badge ${tab.badgeColor === 'yellow' ? 'yellow' : ''}`}>
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
