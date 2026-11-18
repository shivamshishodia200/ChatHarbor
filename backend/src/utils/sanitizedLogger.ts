export interface SafeLogMeta {
  tenantId?: string;
  userId?: string;
  destinationType?: string;
  destinationId?: string;
  messageCount?: number;
  skippedCount?: number;
  contentHash?: string;
  action?: string;
  status?: string;
  statusCode?: number;
  error?: string;
  durationMs?: number;
}

export class SanitizedLogger {
  private format(level: string, message: string, meta?: SafeLogMeta): string {
    const timestamp = new Date().toISOString();
    // Intentionally omit any message text, raw content, or filenames
    const sanitizedMeta = meta ? { ...meta } : undefined;
    return JSON.stringify({
      timestamp,
      level,
      message,
      meta: sanitizedMeta
    });
  }

  info(message: string, meta?: SafeLogMeta): void {
    console.log(this.format('INFO', message, meta));
  }

  warn(message: string, meta?: SafeLogMeta): void {
    console.warn(this.format('WARN', message, meta));
  }

  error(message: string, meta?: SafeLogMeta): void {
    console.error(this.format('ERROR', message, meta));
  }
}

export const logger = new SanitizedLogger();

