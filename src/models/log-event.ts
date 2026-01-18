/**
 * Log severity levels
 */
export enum LogLevel {
  Trace = 'trace',
  Debug = 'debug',
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
  Fatal = 'fatal',
}

/**
 * Log category types
 */
export enum LogType {
  General = 'general',
  Analytics = 'analytics',
  Crash = 'crash',
  Performance = 'performance',
}

export interface DeviceMetadata {
  platform?: string;
  osVersion?: string;
  deviceModel?: string;
  appVersion?: string;
  appBuildNumber?: string;
}

export interface LogEvent {
  id: string;
  type: LogType;
  level: LogLevel;
  message: string;
  timestamp: string;
  stackTrace?: string;
  /** Structured stack trace elements for better crash grouping */
  stackTraceElements?: Array<{ file: string; line: string; method: string; column?: string; class?: string }>;
  metadata?: Record<string, unknown>;
  device?: DeviceMetadata;
  userId?: string;
  userName?: string;
  userEmail?: string;
  sessionId?: string;
}

let _counter = 0;

/**
 * Generates unique log event ID using timestamp + counter
 */
export function generateLogEventId(): string {
  const timestamp = Date.now() * 1000;
  _counter = (_counter + 1) % 10000;
  return `${timestamp}_${_counter}`;
}

export function createLogEvent(
  params: Omit<LogEvent, 'id'> & { id?: string }
): LogEvent {
  return {
    id: params.id ?? generateLogEventId(),
    type: params.type,
    level: params.level,
    message: params.message,
    timestamp: params.timestamp,
    stackTrace: params.stackTrace,
    stackTraceElements: params.stackTraceElements,
    metadata: params.metadata,
    device: params.device,
    userId: params.userId,
    userName: params.userName,
    userEmail: params.userEmail,
    sessionId: params.sessionId,
  };
}

export function logEventToJson(event: LogEvent): Record<string, unknown> {
  const json: Record<string, unknown> = {
    id: event.id,
    type: event.type,
    level: event.level,
    message: event.message,
    timestamp: event.timestamp,
  };

  if (event.stackTrace) json.stackTrace = event.stackTrace;
  if (event.stackTraceElements) json.stackTraceElements = event.stackTraceElements;
  if (event.metadata) json.metadata = event.metadata;
  if (event.device) json.device = event.device;
  if (event.userId) json.userId = event.userId;
  if (event.userName) json.userName = event.userName;
  if (event.userEmail) json.userEmail = event.userEmail;
  if (event.sessionId) json.sessionId = event.sessionId;

  return json;
}

export function logEventFromJson(json: Record<string, unknown>): LogEvent {
  return createLogEvent({
    id: (json.id as string) ?? undefined,
    type: parseLogType((json.type as string) ?? 'general'),
    level: (json.level as LogLevel) ?? LogLevel.Info,
    message: (json.message as string) ?? '',
    timestamp: (json.timestamp as string) ?? new Date().toISOString(),
    stackTrace: json.stackTrace as string | undefined,
    stackTraceElements: json.stackTraceElements as LogEvent['stackTraceElements'] | undefined,
    metadata: json.metadata as Record<string, unknown> | undefined,
    device: json.device as DeviceMetadata | undefined,
    userId: json.userId as string | undefined,
    userName: json.userName as string | undefined,
    userEmail: json.userEmail as string | undefined,
    sessionId: json.sessionId as string | undefined,
  });
}

export function getLogLevelSeverity(level: LogLevel): number {
  const severities: Record<LogLevel, number> = {
    [LogLevel.Trace]: 0,
    [LogLevel.Debug]: 1,
    [LogLevel.Info]: 2,
    [LogLevel.Warning]: 3,
    [LogLevel.Error]: 4,
    [LogLevel.Fatal]: 5,
  };
  return severities[level];
}

export function isErrorLevel(level: LogLevel): boolean {
  return level === LogLevel.Error || level === LogLevel.Fatal;
}

/**
 * Parse log type with backward compatibility for legacy values
 */
export function parseLogType(type: string): LogType {
  const mapping: Record<string, LogType> = {
    general: LogType.General,
    log: LogType.General,
    error: LogType.General,
    network: LogType.General,
    security: LogType.General,
    custom: LogType.General,
    analytics: LogType.Analytics,
    event: LogType.Analytics,
    crash: LogType.Crash,
    exception: LogType.Crash,
    performance: LogType.Performance,
  };
  return mapping[type.toLowerCase()] ?? LogType.General;
}
