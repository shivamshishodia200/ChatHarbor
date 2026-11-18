import React, { useState } from 'react';
import type { ParseResult } from '../shared/types.ts';

interface WhatsAppPreviewProps {
  parseResult: ParseResult;
  selectedRecordName: string;
  selectedRecordType: 'lead' | 'contact';
}

export const WhatsAppPreview: React.FC<WhatsAppPreviewProps> = ({
  parseResult,
  selectedRecordName,
  selectedRecordType
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [showSkipped, setShowSkipped] = useState(false);
  const pageSize = 5;

  const totalPages = Math.ceil(parseResult.messages.length / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const currentMessages = parseResult.messages.slice(startIndex, startIndex + pageSize);

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'N/A';
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  };

  return (
    <div className="preview-container">
      <div className="preview-header-badge">
        <span>Destination: <strong>{selectedRecordName}</strong> (Contact)</span>
      </div>

      {parseResult.isDateAmbiguous && (
        <div className="alert alert-warning" role="alert">
          <div className="alert-icon">⚠️</div>
          <div>
            <strong>Ambiguous Date Format Detected:</strong>
            <p>
              Day and month numbers are all 12 or less in this file. Please verify or change the date format below to ensure accurate timeline ordering.
            </p>
          </div>
        </div>
      )}

      {/* Metrics Row */}
      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-label">Total Messages</span>
          <span className="metric-value">{parseResult.messageCount}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Senders Found</span>
          <span className="metric-value">{parseResult.senderLabels.length}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Skipped Events</span>
          <span className="metric-value text-muted">{parseResult.skippedCount}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Date Range</span>
          <span className="metric-subtext">
            {formatDate(parseResult.dateRange?.start)}
            <br />to<br />
            {formatDate(parseResult.dateRange?.end)}
          </span>
        </div>
      </div>

      {/* Sender Badges */}
      <div className="senders-row">
        <span className="section-title">Participants:</span>
        <div className="chips-container">
          {parseResult.senderLabels.map((sender) => (
            <span key={sender} className="badge badge-sender">
              👤 {sender}
            </span>
          ))}
        </div>
      </div>

      {/* Skipped Lines Toggle */}
      {parseResult.skippedCount > 0 && (
        <div className="skipped-section">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setShowSkipped(!showSkipped)}
          >
            {showSkipped ? 'Hide' : 'Review'} {parseResult.skippedCount} Skipped Line(s) & System Events
          </button>

          {showSkipped && (
            <div className="skipped-list">
              <p className="helper-text">
                The following lines are WhatsApp encryption notices, group actions, or non-message entries and will not be imported:
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Reason</th>
                    <th>Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {parseResult.skippedLines.map((s, idx) => (
                    <tr key={idx}>
                      <td>#{s.lineNumber}</td>
                      <td><span className="badge badge-subtle">{s.reason}</span></td>
                      <td className="code-text">{s.preview}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Paginated Messages Feed */}
      <div className="messages-preview-section">
        <div className="preview-nav-header">
          <span className="section-title">Message Preview</span>
          <span className="pagination-info">
            Showing {parseResult.messages.length === 0 ? 0 : startIndex + 1} -{' '}
            {Math.min(startIndex + pageSize, parseResult.messages.length)} of {parseResult.messages.length}
          </span>
        </div>

        <div className="preview-messages-list">
          {currentMessages.map((msg) => (
            <div key={msg.id} className="preview-msg-card">
              <div className="msg-meta">
                <span className="msg-sender">{msg.sender}</span>
                <span className="msg-original-time" title={`UTC: ${msg.timestampUtc}`}>
                  🕒 {msg.originalTimestamp}
                </span>
              </div>
              <div className="msg-body">{msg.messageText}</div>
            </div>
          ))}
          {currentMessages.length === 0 && (
            <div className="empty-preview">No valid messages found to preview.</div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="pagination-controls">
            <button
              type="button"
              className="btn btn-sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
            >
              Previous
            </button>
            <span>Page {currentPage} of {totalPages}</span>
            <button
              type="button"
              className="btn btn-sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(currentPage + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

