export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

export interface WhatsAppMessage {
  id: string;
  sender: string;
  messageText: string;
  originalTimestamp: string;
  timestampUtc: string;
  sequenceOrder: number;
}

export interface SkippedLineInfo {
  lineNumber: number;
  preview: string;
  reason: 'system_message' | 'malformed_line' | 'empty_line' | 'leading_garbage';
}

export interface ParseResult {
  messages: WhatsAppMessage[];
  messageCount: number;
  skippedCount: number;
  skippedLines: SkippedLineInfo[];
  senderLabels: string[];
  dateRange: {
    start: string;
    end: string;
  } | null;
  detectedDateFormat: DateFormat;
  isDateAmbiguous: boolean;
  timezone: string;
}

export interface ParseOptions {
  dateFormat?: DateFormat;
  timezone?: string; // e.g. "UTC", "Asia/Kolkata", "America/New_York"
}

export interface WhatsAppImportRecord {
  id: string;
  tenantId: string;
  destinationType: 'lead' | 'contact';
  destinationId: string;
  contentHash: string;
  messageCount: number;
  skippedCount: number;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  timezone: string;
  dateFormat: string;
  createdBy: string;
  createdAt: string;
}

export interface TimelineEvent {
  id: string;
  tenantId: string;
  destinationType: 'lead' | 'contact';
  destinationId: string;
  eventType: 'whatsapp_message' | 'note' | 'call' | 'status_change';
  sender?: string;
  content: string;
  timestampUtc: string;
  originalTimestamp?: string;
  sequenceOrder: number;
  importId?: string;
  createdAt: string;
}

export interface LeadOrContact {
  id: string;
  tenantId: string;
  type: 'lead' | 'contact';
  name: string;
  email: string;
  phone: string;
  status: string;
  createdAt: string;
}
