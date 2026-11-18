import React, { useState, useEffect } from 'react';
import { parseWhatsAppChat } from '../shared/whatsappParser.ts';
import type { DateFormat, ParseResult } from '../shared/types.ts';
import { importWhatsAppChat } from '../api.ts';
import { WhatsAppPreview } from './WhatsAppPreview.tsx';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB limit

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
  'UTC'
];

interface WhatsAppImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  destinationType: 'contact';
  destinationId: string;
  destinationName: string;
  defaultTimezone: string;
  onImportSuccess: () => void;
}

export const WhatsAppImportModal: React.FC<WhatsAppImportModalProps> = ({
  isOpen,
  onClose,
  destinationType,
  destinationId,
  destinationName,
  defaultTimezone,
  onImportSuccess
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [dateFormat, setDateFormat] = useState<DateFormat>('DD/MM/YYYY');
  const [timezone, setTimezone] = useState<string>(defaultTimezone || 'UTC');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (defaultTimezone) {
      setTimezone(defaultTimezone);
    }
  }, [defaultTimezone]);

  // Re-parse when dateFormat or timezone changes
  useEffect(() => {
    if (fileContent) {
      try {
        const result = parseWhatsAppChat(fileContent, {
          dateFormat,
          timezone
        });
        setParseResult(result);
        if (result.isDateAmbiguous && !dateFormat) {
          setDateFormat(result.detectedDateFormat);
        }
      } catch (err: any) {
        setError(`Failed to parse file: ${err.message}`);
      }
    }
  }, [fileContent, dateFormat, timezone]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploadSuccessMessage(null);

    // 1. Client-side file extension check
    if (!file.name.toLowerCase().endsWith('.txt')) {
      setError('Unsupported file type. WhatsApp exports must be plain text (.txt) files.');
      setSelectedFile(null);
      setParseResult(null);
      return;
    }

    // 2. Client-side 5 MB file size limit enforcement
    if (file.size > MAX_FILE_SIZE) {
      setError(`File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 5 MB limit. Please select a smaller export without media.`);
      setSelectedFile(null);
      setParseResult(null);
      return;
    }

    if (file.size === 0) {
      setError('The selected file is empty.');
      setSelectedFile(null);
      setParseResult(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text || !text.trim()) {
        setError('The selected file contains no readable text.');
        setSelectedFile(null);
        setParseResult(null);
        return;
      }

      setSelectedFile(file);
      setFileContent(text);

      try {
        const result = parseWhatsAppChat(text, {
          dateFormat,
          timezone
        });

        if (result.messageCount === 0) {
          setError('No recognizable WhatsApp messages found in the file. Please ensure this is an unedited WhatsApp export.');
          setParseResult(null);
          return;
        }

        setParseResult(result);
        if (result.detectedDateFormat) {
          setDateFormat(result.detectedDateFormat);
        }
      } catch (err: any) {
        setError(`Failed to parse WhatsApp export: ${err.message}`);
        setParseResult(null);
      }
    };

    reader.onerror = () => {
      setError('Could not read the selected file.');
    };

    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    if (!selectedFile || !parseResult) return;

    setIsUploading(true);
    setError(null);

    try {
      const response = await importWhatsAppChat(
        destinationType,
        destinationId,
        selectedFile,
        dateFormat,
        timezone
      );

      if (response.status === 'already_imported') {
        setUploadSuccessMessage('This chat export was already imported previously. Timeline is up-to-date!');
      } else {
        setUploadSuccessMessage(`Successfully imported ${response.messageCount} WhatsApp messages!`);
      }

      setTimeout(() => {
        setIsUploading(false);
        onImportSuccess();
        handleClose();
      }, 1200);
    } catch (err: any) {
      setIsUploading(false);
      const msg = err.data?.error || err.message || 'Upload failed. Please check your connection and retry.';
      setError(`Import failed: ${msg}`);
      // Note: We deliberately KEEP selectedFile and parseResult so the user can click "Retry"
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setFileContent('');
    setParseResult(null);
    setError(null);
    setUploadSuccessMessage(null);
    setIsUploading(false);
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-dialog">
        <div className="modal-header">
          <div className="modal-title-group">
            <h3>💬 Import WhatsApp Chat</h3>
            <span className="modal-subtitle">
              Destination: {destinationName} (Contact)
            </span>
          </div>
          <button type="button" className="close-btn" onClick={handleClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="alert alert-danger" role="alert">
              <span>⚠️ {error}</span>
            </div>
          )}

          {uploadSuccessMessage && (
            <div className="alert alert-success" role="alert">
              <span>✅ {uploadSuccessMessage}</span>
            </div>
          )}

          {/* File Selection Dropzone */}
          {!parseResult && !uploadSuccessMessage && (
            <div className="upload-dropzone">
              <label htmlFor="file-upload-input" className="dropzone-label">
                <div className="dropzone-icon">📄</div>
                <div className="dropzone-prompt">
                  <strong>Select a WhatsApp conversation export (.txt)</strong>
                  <span>Max file size: 5 MB (Text only, without media)</span>
                </div>
                <input
                  id="file-upload-input"
                  type="file"
                  accept=".txt,text/plain"
                  onChange={handleFileChange}
                  className="visually-hidden"
                />
              </label>
            </div>
          )}

          {/* Configuration and Local Preview */}
          {parseResult && !uploadSuccessMessage && (
            <>
              <div className="config-panel">
                <div className="config-item">
                  <label htmlFor="select-date-format">Date Format:</label>
                  <select
                    id="select-date-format"
                    value={dateFormat}
                    onChange={(e) => setDateFormat(e.target.value as DateFormat)}
                    className="select-input"
                  >
                    <option value="DD/MM/YYYY">DD/MM/YYYY (Day first, e.g. 31/12/2024)</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY (Month first, e.g. 12/31/2024)</option>
                  </select>
                </div>

                <div className="config-item">
                  <label htmlFor="select-timezone">Chat Timezone:</label>
                  <select
                    id="select-timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="select-input"
                  >
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz} {tz === defaultTimezone ? '(CRM Default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <WhatsAppPreview
                parseResult={parseResult}
                selectedRecordName={destinationName}
                selectedRecordType={destinationType}
              />
            </>
          )}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleClose}
            disabled={isUploading}
          >
            Cancel
          </button>

          {parseResult && !uploadSuccessMessage && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleConfirmImport}
              disabled={isUploading || parseResult.messageCount === 0}
            >
              {isUploading ? (
                <>⏳ Importing...</>
              ) : error ? (
                <>🔄 Retry Import</>
              ) : (
                <>Confirm Import ({parseResult.messageCount} messages)</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

