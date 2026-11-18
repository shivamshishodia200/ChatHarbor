import React from 'react';

interface TimelineEvent {
  id: string;
  tenant_id: string;
  destination_type: 'lead' | 'contact';
  destination_id: string;
  event_type: 'whatsapp_message' | 'whatsapp_import' | 'note' | 'call' | 'status_change';
  sender?: string;
  content: string;
  timestamp_utc: string;
  original_timestamp?: string;
  sequence_order: number;
  import_id?: string;
  created_at: string;
  import_message_count?: number;
  import_skipped_count?: number;
  import_created_at?: string;
}

interface TimelineViewProps {
  events: TimelineEvent[];
  isLoading: boolean;
  total: number;
}

export const TimelineView: React.FC<TimelineViewProps> = ({ events, isLoading, total }) => {
  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  if (isLoading) {
    return <div className="timeline-loading">Loading CRM timeline...</div>;
  }

  if (events.length === 0) {
    return (
      <div className="empty-timeline">
        <div className="empty-icon">⏳</div>
        <p>No timeline activities yet. Use the action bar above to add notes or import WhatsApp conversations.</p>
      </div>
    );
  }

  return (
    <div className="timeline-container">
      <div className="timeline-header">
        <h4>Activity Timeline ({total} events)</h4>
      </div>

      <div className="timeline-stream">
        {events.map((event) => {
          if (event.event_type === 'whatsapp_message') {
            return (
              <div key={event.id} className="timeline-item timeline-whatsapp">
                <div className="timeline-icon-bubble whatsapp-bubble">💬</div>
                <div className="timeline-content-card">
                  <div className="timeline-card-header">
                    <div className="timeline-title-row">
                      <span className="badge badge-whatsapp">WhatsApp import</span>
                      <strong className="timeline-sender">{event.sender}</strong>
                    </div>
                    <div className="timeline-time-group">
                      {event.original_timestamp && (
                        <span className="original-time-tag" title="Original export text">
                          Raw: {event.original_timestamp}
                        </span>
                      )}
                      <span className="timeline-date">{formatDateTime(event.timestamp_utc)}</span>
                    </div>
                  </div>
                  {/* Escaped plain text rendering guarantees no HTML/script injection */}
                  <div className="timeline-message-body">{event.content}</div>
                </div>
              </div>
            );
          }

          if (event.event_type === 'whatsapp_import') {
            return (
              <div key={event.id} className="timeline-item timeline-audit">
                <div className="timeline-icon-bubble audit-bubble">📋</div>
                <div className="timeline-content-card audit-card">
                  <div className="timeline-card-header">
                    <span className="badge badge-audit">Audit Record</span>
                    <span className="timeline-date">{formatDateTime(event.created_at)}</span>
                  </div>
                  <div className="audit-body">
                    <strong>WhatsApp Batch Import Summary:</strong> {event.content}
                    {event.import_created_at && (
                      <div className="audit-subtext">
                        Processed on {formatDateTime(event.import_created_at)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          // General notes / calls
          return (
            <div key={event.id} className="timeline-item timeline-generic">
              <div className="timeline-icon-bubble generic-bubble">📝</div>
              <div className="timeline-content-card">
                <div className="timeline-card-header">
                  <span className="badge badge-generic">{event.event_type}</span>
                  <span className="timeline-date">{formatDateTime(event.timestamp_utc)}</span>
                </div>
                <div className="timeline-body">{event.content}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

