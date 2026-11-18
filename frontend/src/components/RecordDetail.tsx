import React, { useState, useEffect, useCallback } from 'react';
import { getTimeline } from '../api.ts';
import { TimelineView } from './TimelineView.tsx';
import { WhatsAppImportModal } from './WhatsAppImportModal.tsx';

interface RecordDetailProps {
  record: any;
  type: 'contact';
  tenantTimezone: string;
}

export const RecordDetail: React.FC<RecordDetailProps> = ({ record, type, tenantTimezone }) => {
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [totalEvents, setTotalEvents] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const fetchTimeline = useCallback(async () => {
    if (!record) return;
    setIsLoading(true);
    try {
      const data = await getTimeline(type, record.id);
      setTimelineEvents(data.events);
      setTotalEvents(data.total);
    } catch (err) {
      console.error('Failed to load timeline:', err);
    } finally {
      setIsLoading(false);
    }
  }, [record, type]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  if (!record) {
    return <div className="no-record-selected">Select a lead or contact from the sidebar to view details.</div>;
  }

  return (
    <div className="record-detail-view">
      <div className="record-header">
        <div className="record-info">
          <div className="record-title-row">
            <h2>{record.name}</h2>
            <span className={`status-pill status-${record.status || 'active'}`}>
              {record.status || 'Active'}
            </span>
          </div>
          <div className="record-meta-row">
            {record.email && <span>📧 {record.email}</span>}
            {record.phone && <span>📞 {record.phone}</span>}
            {(record.company || record.account_name) && (
              <span>🏢 {record.company || record.account_name}</span>
            )}
          </div>
        </div>

        <div className="record-actions">
          <button
            type="button"
            className="btn btn-whatsapp-action"
            onClick={() => setIsModalOpen(true)}
          >
            💬 Import WhatsApp Chat
          </button>
        </div>
      </div>

      <TimelineView
        events={timelineEvents}
        isLoading={isLoading}
        total={totalEvents}
      />

      <WhatsAppImportModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        destinationType={type}
        destinationId={record.id}
        destinationName={record.name}
        defaultTimezone={tenantTimezone}
        onImportSuccess={fetchTimeline}
      />
    </div>
  );
};

