import type { DateFormat, ParseOptions, ParseResult, SkippedLineInfo, WhatsAppMessage } from './types.ts';

// Regex for WhatsApp header formats
// 1. Android style: 12/31/20, 11:59 PM - Sender: Message OR 31/12/2020, 23:59 - Sender: Message
// 2. iOS style: [12/31/20, 11:59:00 PM] Sender: Message OR [31/12/2020, 23:59:00] Sender: Message

const ANDROID_HEADER_REGEX = /^(\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?)\s*-\s*(.*)$/;
const IOS_HEADER_REGEX = /^\[(\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?)\]\s*(.*)$/;

export function cleanText(input: string): string {
  if (!input) return '';
  return input
    .replace(/^\uFEFF/, '') // Remove UTF-8 BOM
    .replace(/[\u200E\u200F\u202A-\u202E]/g, '') // Remove RTL and LTR direction marks
    .replace(/[\u00A0\u202F]/g, ' '); // Replace non-breaking and narrow non-breaking spaces
}

export function detectAmbiguityAndFormat(
  rawLines: string[],
  userSpecifiedFormat?: DateFormat
): { detectedFormat: DateFormat; isAmbiguous: boolean } {
  let sawD1GreaterThan12 = false;
  let sawD2GreaterThan12 = false;
  let sawHeader = false;

  for (const rawLine of rawLines) {
    const line = cleanText(rawLine).trim();
    if (!line) continue;

    const match = line.match(ANDROID_HEADER_REGEX) || line.match(IOS_HEADER_REGEX);
    if (!match) continue;

    sawHeader = true;
    const dateStr = match[1];
    const parts = dateStr.split(/[/.-]/).map(p => parseInt(p, 10));

    if (parts.length === 3) {
      const [p1, p2] = parts;
      if (p1 > 12) sawD1GreaterThan12 = true;
      if (p2 > 12) sawD2GreaterThan12 = true;
    }
  }

  if (sawD1GreaterThan12 && !sawD2GreaterThan12) {
    return { detectedFormat: 'DD/MM/YYYY', isAmbiguous: false };
  }
  if (sawD2GreaterThan12 && !sawD1GreaterThan12) {
    return { detectedFormat: 'MM/DD/YYYY', isAmbiguous: false };
  }

  // If both <= 12 throughout or no clear distinction
  return {
    detectedFormat: userSpecifiedFormat || 'DD/MM/YYYY',
    isAmbiguous: sawHeader && !sawD1GreaterThan12 && !sawD2GreaterThan12
  };
}

export function parseDateComponents(
  dateStr: string,
  timeStr: string,
  format: DateFormat,
  timezone: string
): { timestampUtc: string; originalTimestamp: string } {
  const originalTimestamp = `${dateStr}, ${timeStr}`.trim();
  const dateParts = dateStr.split(/[/.-]/).map(p => parseInt(p, 10));
  if (dateParts.length !== 3) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }

  let year: number;
  let month: number;
  let day: number;

  if (dateParts[0] > 1000) {
    // YYYY-MM-DD
    year = dateParts[0];
    month = dateParts[1];
    day = dateParts[2];
  } else if (format === 'MM/DD/YYYY') {
    month = dateParts[0];
    day = dateParts[1];
    year = dateParts[2];
  } else {
    // Default DD/MM/YYYY
    day = dateParts[0];
    month = dateParts[1];
    year = dateParts[2];
  }

  // Handle 2-digit years
  if (year < 100) {
    year += year < 70 ? 2000 : 1900;
  }

  // Parse Time: e.g. "11:59 PM", "23:59:15", "9:30 am"
  const cleanTime = timeStr.trim().replace(/\s+/g, ' ');
  const ampmMatch = cleanTime.match(/([AaPp][Mm])$/i);
  const timeWithoutAmpm = cleanTime.replace(/\s*[AaPp][Mm]$/i, '').trim();
  const timeTokens = timeWithoutAmpm.split(':').map(t => parseInt(t, 10));

  let hour = timeTokens[0] || 0;
  const minute = timeTokens[1] || 0;
  const second = timeTokens[2] || 0;

  if (ampmMatch) {
    const isPm = ampmMatch[1].toUpperCase() === 'PM';
    if (isPm && hour < 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
  }

  const timestampUtc = localToUtc(year, month, day, hour, minute, second, timezone);
  return { timestampUtc, originalTimestamp };
}

export function localToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  second: number,
  timezone: string = 'UTC'
): string {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    });
    const parts = Object.fromEntries(dtf.formatToParts(guess).map(p => [p.type, p.value]));
    const tzHour = parseInt(parts.hour, 10) % 24;
    const tzDate = new Date(Date.UTC(
      parseInt(parts.year, 10),
      parseInt(parts.month, 10) - 1,
      parseInt(parts.day, 10),
      tzHour,
      parseInt(parts.minute, 10),
      parseInt(parts.second, 10)
    ));
    const offset = guess.getTime() - tzDate.getTime();
    return new Date(guess.getTime() + offset).toISOString();
  } catch {
    // Fallback to UTC if invalid timezone supplied
    return guess.toISOString();
  }
}

export function parseWhatsAppChat(fileContent: string, options: ParseOptions = {}): ParseResult {
  const cleaned = cleanText(fileContent);
  if (!cleaned.trim()) {
    return {
      messages: [],
      messageCount: 0,
      skippedCount: 0,
      skippedLines: [],
      senderLabels: [],
      dateRange: null,
      detectedDateFormat: options.dateFormat || 'DD/MM/YYYY',
      isDateAmbiguous: false,
      timezone: options.timezone || 'UTC'
    };
  }

  const lines = cleaned.split(/\r?\n/);
  const { detectedFormat, isAmbiguous } = detectAmbiguityAndFormat(lines, options.dateFormat);
  const activeFormat = options.dateFormat || detectedFormat;
  const timezone = options.timezone || 'UTC';

  const messages: WhatsAppMessage[] = [];
  const skippedLines: SkippedLineInfo[] = [];
  const sendersSet = new Set<string>();

  let currentMessage: WhatsAppMessage | null = null;
  let sequence = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    const trimmed = line.trim();

    if (!trimmed) {
      if (currentMessage) {
        // preserve blank lines in multiline messages
        currentMessage.messageText += '\n';
      } else {
        skippedLines.push({
          lineNumber,
          preview: '(empty line)',
          reason: 'empty_line'
        });
      }
      continue;
    }

    const headerMatch = trimmed.match(ANDROID_HEADER_REGEX) || trimmed.match(IOS_HEADER_REGEX);

    if (headerMatch) {
      const dateStr = headerMatch[1];
      const timeStr = headerMatch[2];
      const payload = headerMatch[3];

      // Check if this is a user message or system event
      // Senders have a colon separator: "Sender Name: Message body"
      const colonIndex = payload.indexOf(': ');

      if (colonIndex === -1) {
        // System event (e.g. encryption notice, group creation, member added, missed call)
        skippedLines.push({
          lineNumber,
          preview: payload.length > 80 ? payload.substring(0, 80) + '...' : payload,
          reason: 'system_message'
        });
        currentMessage = null; // Do not append continuation to previous message
        continue;
      }

      const sender = payload.substring(0, colonIndex).trim();
      const messageBody = payload.substring(colonIndex + 2);

      try {
        const { timestampUtc, originalTimestamp } = parseDateComponents(
          dateStr,
          timeStr,
          activeFormat,
          timezone
        );

        sequence++;
        const message: WhatsAppMessage = {
          id: `msg-${sequence}-${Date.now().toString(36)}`,
          sender,
          messageText: messageBody,
          originalTimestamp,
          timestampUtc,
          sequenceOrder: sequence
        };

        messages.push(message);
        sendersSet.add(sender);
        currentMessage = message;
      } catch (err: any) {
        skippedLines.push({
          lineNumber,
          preview: trimmed.substring(0, 80),
          reason: 'malformed_line'
        });
        currentMessage = null;
      }
    } else {
      // Continuation of current message or leading garbage
      if (currentMessage) {
        currentMessage.messageText += '\n' + line;
      } else {
        skippedLines.push({
          lineNumber,
          preview: trimmed.length > 80 ? trimmed.substring(0, 80) + '...' : trimmed,
          reason: 'leading_garbage'
        });
      }
    }
  }

  // Date range
  let dateRange: { start: string; end: string } | null = null;
  if (messages.length > 0) {
    const sorted = [...messages].sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc));
    dateRange = {
      start: sorted[0].timestampUtc,
      end: sorted[sorted.length - 1].timestampUtc
    };
  }

  return {
    messages,
    messageCount: messages.length,
    skippedCount: skippedLines.length,
    skippedLines,
    senderLabels: Array.from(sendersSet),
    dateRange,
    detectedDateFormat: activeFormat,
    isDateAmbiguous: isAmbiguous,
    timezone
  };
}
