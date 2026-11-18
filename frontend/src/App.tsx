import React, { useState, useEffect } from 'react';
import { getContacts, setApiToken } from './api.ts';
import { RecordDetail } from './components/RecordDetail.tsx';

interface TenantProfile {
  id: string;
  name: string;
  user: string;
  token: string;
  timezone: string;
}

const AVAILABLE_TENANTS: TenantProfile[] = [
  {
    id: 'tenant-acme',
    name: 'Acme Corporation',
    user: 'Alice Smith (Account Exec)',
    token: 'token-acme-alice-123',
    timezone: 'America/New_York'
  },
  {
    id: 'tenant-globex',
    name: 'Globex Corporation',
    user: 'Hank Scorpio (Sales Manager)',
    token: 'token-globex-hank-456',
    timezone: 'Europe/London'
  }
];

export const App: React.FC = () => {
  const [currentTenant, setCurrentTenant] = useState<TenantProfile>(AVAILABLE_TENANTS[0]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedContact, setSelectedContact] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    setApiToken(currentTenant.token);
    loadContacts();
  }, [currentTenant]);

  const loadContacts = async (query = searchQuery) => {
    setIsLoading(true);
    try {
      const data = await getContacts(query);
      setContacts(data.contacts);
      if (data.contacts.length > 0) {
        setSelectedContact(data.contacts[0]);
      } else {
        setSelectedContact(null);
      }
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTenantChange = (tenantId: string) => {
    const found = AVAILABLE_TENANTS.find((t) => t.id === tenantId);
    if (found) {
      setCurrentTenant(found);
      setSearchQuery('');
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadContacts(searchQuery);
  };

  return (
    <div className="crm-app">
      {/* Top Navbar */}
      <header className="crm-topbar">
        <div className="crm-branding">
          <span className="brand-logo">⚓</span>
          <span className="brand-name">ChatHarbor</span>
          <span className="brand-suite">Conversational CRM</span>
        </div>

        <div className="tenant-selector-bar">
          <label htmlFor="tenant-dropdown" className="tenant-label">Account:</label>
          <select
            id="tenant-dropdown"
            value={currentTenant.id}
            onChange={(e) => handleTenantChange(e.target.value)}
            className="tenant-select"
          >
            {AVAILABLE_TENANTS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.timezone})
              </option>
            ))}
          </select>
          <div className="user-pill">
            <span>👤 {currentTenant.user}</span>
          </div>
        </div>
      </header>

      {/* Main CRM Body */}
      <div className="crm-layout">
        {/* Sidebar - Contacts Primary Workflow */}
        <aside className="crm-sidebar">
          <div className="contacts-sidebar-header">
            <span className="sidebar-heading">👥 Contacts</span>
            <span className="badge badge-subtle">{contacts.length}</span>
          </div>

          <form onSubmit={handleSearch} className="search-box">
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </form>

          <div className="record-list">
            {isLoading && <div className="list-loading">Loading contacts...</div>}
            {!isLoading && contacts.length === 0 && (
              <div className="empty-list">No contacts found for this account.</div>
            )}
            {!isLoading && contacts.map((contact) => (
              <div
                key={contact.id}
                className={`record-card ${selectedContact?.id === contact.id ? 'active' : ''}`}
                onClick={() => setSelectedContact(contact)}
              >
                <div className="record-card-title">{contact.name}</div>
                <div className="record-card-sub">
                  {contact.account_name || contact.email || contact.phone}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Content Pane */}
        <main className="crm-content">
          {selectedContact ? (
            <RecordDetail
              record={selectedContact}
              type="contact"
              tenantTimezone={currentTenant.timezone}
            />
          ) : (
            <div className="no-record-selected">
              <h3>No Contact Selected</h3>
              <p>Select a contact from the list or switch accounts to explore ChatHarbor.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
