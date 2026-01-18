import { AppState, AppStateStatus } from 'react-native';
import { gzip } from 'pako';
import {
  setJSExceptionHandler,
  setNativeExceptionHandler,
} from 'react-native-exception-handler';

import {
  LogEvent,
  LogLevel,
  LogType,
  DeviceMetadata,
  Session,
  createLogEvent,
  logEventToJson,
  logEventFromJson,
  sessionToJson,
  isSessionActive,
  getSessionDuration,
} from './models';

import {
  collectDeviceInfo,
  LogRateLimiter,
  STORAGE_KEYS,
  getStorageItem,
  setStorageItem,
  getStringList,
  setStringList,
} from './utils';

interface InitOptions {
  userId?: string;
  userName?: string;
  userEmail?: string;
  enableDebugLogs?: boolean;
}

interface LogOptions {
  level?: LogLevel;
  type?: LogType;
  metadata?: Record<string, unknown>;
  stackTrace?: string;
  error?: Error;
}

interface FunnelOptions {
  funnelName: string;
  stepName: string;
  step?: number;
  properties?: Record<string, unknown>;
}

interface ExceptionOptions {
  error: Error;
  stackTrace?: string;
  context?: string;
  metadata?: Record<string, unknown>;
}

interface UserOptions {
  userId: string;
  userName?: string;
  userEmail?: string;
}

declare const __DEV__: boolean;

/**
 * Telling SDK for React Native
 * Production-ready crash reporting, error tracking, and analytics
 */
class TellingLogger {
  private static _instance: TellingLogger;

  static get instance(): TellingLogger {
    if (!TellingLogger._instance) {
      TellingLogger._instance = new TellingLogger();
    }
    return TellingLogger._instance;
  }

  private _apiKey?: string;
  private readonly _baseUrl = 'https://tellingserver.globeapp.dev/api/v1/logs';
  private _initialized = false;
  private _deviceMetadata?: DeviceMetadata;
  private _enableDebugLogs = false;

  private _userId?: string;
  private _userName?: string;
  private _userEmail?: string;
  private _userProperties: Record<string, unknown> = {};

  private _buffer: LogEvent[] = [];
  private _flushTimer?: ReturnType<typeof setInterval>;
  private _cleanupTimer?: ReturnType<typeof setInterval>;

  private _rateLimiter = new LogRateLimiter();
  private _currentSession?: Session;

  private _screenStartTime?: Date;
  private _currentScreen?: string;

  private _breadcrumbs: Array<Record<string, unknown>> = [];
  private static readonly _maxBreadcrumbs = 20;

  private _consecutiveFailures = 0;
  private static readonly _maxConsecutiveFailures = 5;
  private _permanentFailure = false;
  private _nextRetryTime?: Date;

  private static readonly _maxBufferSize = 500;
  private static readonly _bufferTrimSize = 400;
  private static readonly _batchFlushSize = 20;

  private _lastBackgroundTime?: Date;
  private static readonly _sessionTimeout = 5 * 60 * 1000;

  private _appStateSubscription?: { remove: () => void };

  private constructor() {}

  async init(apiKey: string, options?: InitOptions): Promise<void> {
    this._apiKey = apiKey;
    this._userId = options?.userId;
    this._userName = options?.userName;
    this._userEmail = options?.userEmail;
    this._enableDebugLogs = options?.enableDebugLogs ?? __DEV__;
    this._initialized = true;

    this._deviceMetadata = await collectDeviceInfo();
    await this._trackLifecycleEvents();
    this._startNewSession();
    await this._loadPersistedLogs();
    this._startFlushTimer();
    this._setupAppLifecycleListeners();

    if (this._enableDebugLogs) {
      console.log('Telling SDK Initialized');
    }
  }

  private async _trackLifecycleEvents(): Promise<void> {
    const hasOpenedBefore = await getStorageItem(STORAGE_KEYS.FIRST_OPEN);
    if (!hasOpenedBefore) {
      this.log('first_open', {
        level: LogLevel.Info,
        type: LogType.Analytics,
        metadata: {
          app_version: this._deviceMetadata?.appVersion,
          install_time: new Date().toISOString(),
        },
      });
      await setStorageItem(STORAGE_KEYS.FIRST_OPEN, 'true');
    }

    const lastVersion = await getStorageItem(STORAGE_KEYS.LAST_APP_VERSION);
    const currentVersion = this._deviceMetadata?.appVersion;
    if (lastVersion && currentVersion && lastVersion !== currentVersion) {
      this.log('app_update', {
        level: LogLevel.Info,
        type: LogType.Analytics,
        metadata: {
          previous_version: lastVersion,
          current_version: currentVersion,
        },
      });
    }
    if (currentVersion) {
      await setStorageItem(STORAGE_KEYS.LAST_APP_VERSION, currentVersion);
    }

    this.log('app_open', {
      level: LogLevel.Info,
      type: LogType.Analytics,
      metadata: { app_version: this._deviceMetadata?.appVersion },
    });
  }

  enableCrashReporting(): void {
    if (!this._initialized) {
      if (this._enableDebugLogs) {
        console.warn('Telling SDK not initialized');
      }
      return;
    }

    setJSExceptionHandler((error, isFatal) => {
      if (this._enableDebugLogs) {
        console.log('Telling: Caught JS error:', error);
      }
      this.log(`JS Error: ${error.message}`, {
        level: isFatal ? LogLevel.Fatal : LogLevel.Error,
        type: LogType.Crash,
        metadata: { name: error.name, isFatal },
        stackTrace: error.stack,
      });
    }, true);

    setNativeExceptionHandler((exceptionString) => {
      if (this._enableDebugLogs) {
        console.log('Telling: Caught native error:', exceptionString);
      }
      this.log(`Native Error: ${exceptionString}`, {
        level: LogLevel.Fatal,
        type: LogType.Crash,
      });
    });

    if (this._enableDebugLogs) {
      console.log('Telling: Crash reporting enabled');
    }
  }

  log(message: string, options?: LogOptions): void {
    if (!this._initialized) {
      if (this._enableDebugLogs) {
        console.warn('Telling SDK not initialized');
      }
      return;
    }

    const level = options?.level ?? LogLevel.Info;
    const type = options?.type ?? LogType.General;

    const enrichedMetadata: Record<string, unknown> = {
      ...options?.metadata,
    };
    if (type === LogType.Crash && this._breadcrumbs.length > 0) {
      enrichedMetadata.breadcrumbs = [...this._breadcrumbs];
    }

    const event = createLogEvent({
      type,
      level,
      message,
      timestamp: new Date().toISOString(),
      stackTrace: options?.stackTrace ?? options?.error?.stack,
      metadata: Object.keys(enrichedMetadata).length > 0 ? enrichedMetadata : undefined,
      device: this._deviceMetadata,
      userId: this._userId,
      userName: this._userName,
      userEmail: this._userEmail,
      sessionId: this._currentSession?.sessionId,
    });

    if (!this._rateLimiter.shouldSendLog(event)) {
      if (this._enableDebugLogs) {
        console.log(`Telling: Rate limited (${event.level}/${event.type})`);
      }
      return;
    }

    if (this._buffer.length >= TellingLogger._maxBufferSize) {
      const dropCount = this._buffer.length - TellingLogger._bufferTrimSize;
      this._buffer.splice(0, dropCount);
      if (this._enableDebugLogs) {
        console.log(`Telling: Buffer full, dropped ${dropCount} oldest logs`);
      }
    }

    this._buffer.push(event);
    this._rateLimiter.markLogSent(event);
    this._persistLogs();

    if (type === LogType.Analytics) {
      this._addBreadcrumb(message, options?.metadata);
    }

    if (level === LogLevel.Error || this._buffer.length >= TellingLogger._batchFlushSize) {
      this._flush();
    }
  }

  event(name: string, properties?: Record<string, unknown>): void {
    this.log(name, {
      level: LogLevel.Info,
      type: LogType.Analytics,
      metadata: properties,
    });
  }

  trackFunnel(options: FunnelOptions): void {
    this.log(`Funnel: ${options.funnelName} - ${options.stepName}`, {
      level: LogLevel.Info,
      type: LogType.Analytics,
      metadata: {
        funnel_name: options.funnelName,
        funnel_step_name: options.stepName,
        ...(options.step !== undefined && { funnel_step_number: options.step }),
        ...options.properties,
      },
    });
  }

  captureException(options: ExceptionOptions): void {
    this.log(options.error.message, {
      level: LogLevel.Error,
      type: LogType.Crash,
      stackTrace: options.stackTrace ?? options.error.stack,
      metadata: {
        exception_type: options.error.name,
        ...(options.context && { context: options.context }),
        ...options.metadata,
      },
    });
  }

  setUser(options: UserOptions): void {
    if (!this._initialized) return;

    this._userId = options.userId;
    this._userName = options.userName;
    this._userEmail = options.userEmail;

    this._endSession();
    this._startNewSession();

    if (this._enableDebugLogs) {
      console.log(`Telling: User context updated - ${options.userId}`);
    }

    this.log('User identified', {
      level: LogLevel.Info,
      type: LogType.Analytics,
      metadata: {
        userId: options.userId,
        ...(options.userName && { userName: options.userName }),
        ...(options.userEmail && { userEmail: options.userEmail }),
      },
    });
  }

  clearUser(): void {
    if (!this._initialized) return;

    if (this._enableDebugLogs) {
      console.log('Telling: User context cleared');
    }

    this.log('User logged out', { level: LogLevel.Info, type: LogType.Analytics });

    this._userId = undefined;
    this._userName = undefined;
    this._userEmail = undefined;

    this._endSession();
    this._startNewSession();
  }

  setUserProperty(key: string, value: unknown): void {
    this._userProperties[key] = value;
    this.log('User property set', {
      type: LogType.Analytics,
      metadata: { property_key: key, property_value: value },
    });
  }

  setUserProperties(properties: Record<string, unknown>): void {
    Object.assign(this._userProperties, properties);
    this.log('User properties set', {
      type: LogType.Analytics,
      metadata: { properties },
    });
  }

  getUserProperty(key: string): unknown {
    return this._userProperties[key];
  }

  clearUserProperty(key: string): void {
    delete this._userProperties[key];
  }

  clearUserProperties(): void {
    this._userProperties = {};
  }

  handleScreenView(screenName: string, previousScreen?: string): void {
    const now = new Date();

    if (this._currentScreen && this._screenStartTime) {
      const timeSpent = Math.floor((now.getTime() - this._screenStartTime.getTime()) / 1000);
      this.log(`Screen view ended: ${this._currentScreen}`, {
        level: LogLevel.Info,
        type: LogType.Analytics,
        metadata: {
          screen: this._currentScreen,
          timeSpent,
          nextScreen: screenName,
        },
      });
    }

    this._currentScreen = screenName;
    this._screenStartTime = now;

    if (this._enableDebugLogs) {
      console.log(`Telling: Screen view - ${screenName}${previousScreen ? ` (from ${previousScreen})` : ''}`);
    }

    this.log(`Screen view: ${screenName}`, {
      level: LogLevel.Info,
      type: LogType.Analytics,
      metadata: {
        screen: screenName,
        ...(previousScreen && { previousScreen }),
      },
    });
  }

  private _startFlushTimer(): void {
    if (this._flushTimer) clearInterval(this._flushTimer);
    this._flushTimer = setInterval(() => this._flush(), 5000);

    if (this._cleanupTimer) clearInterval(this._cleanupTimer);
    this._cleanupTimer = setInterval(() => this._rateLimiter.cleanup(), 2 * 60 * 1000);
  }

  private async _flush(): Promise<void> {
    if (this._buffer.length === 0) return;

    if (this._permanentFailure) {
      if (this._enableDebugLogs) {
        console.log('Telling: Skipping flush - permanent failure');
      }
      return;
    }

    if (this._nextRetryTime && new Date() < this._nextRetryTime) {
      return;
    }

    const uniqueLogs = new Map<string, LogEvent>();
    for (const logEvent of this._buffer) {
      const hash = `${logEvent.message}_${logEvent.level}_${logEvent.stackTrace ?? ''}`;
      uniqueLogs.set(hash, logEvent);
    }

    const eventsToSend = Array.from(uniqueLogs.values());
    this._buffer = [];

    try {
      const jsonPayload = JSON.stringify(eventsToSend.map(logEventToJson));
      const jsonBytes = new TextEncoder().encode(jsonPayload);

      const useCompression = jsonBytes.length > 1024;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': this._apiKey!,
      };

      let body: Uint8Array | string;
      if (useCompression) {
        body = gzip(jsonBytes);
        headers['Content-Encoding'] = 'gzip';
      } else {
        body = jsonPayload;
      }

      const response = await fetch(this._baseUrl, {
        method: 'POST',
        headers,
        body,
      });

      if (response.status === 200) {
        this._consecutiveFailures = 0;
        this._nextRetryTime = undefined;
        this._persistLogs();
      } else if (response.status === 403) {
        this._consecutiveFailures++;
        if (this._consecutiveFailures >= TellingLogger._maxConsecutiveFailures) {
          this._permanentFailure = true;
          this._buffer = [];
          if (this._enableDebugLogs) {
            console.error('Telling SDK: INVALID API KEY');
          }
        }
        this._persistLogs();
      } else {
        this._consecutiveFailures++;
        this._setBackoff();
        if (this._consecutiveFailures < TellingLogger._maxConsecutiveFailures) {
          this._buffer.push(...eventsToSend);
        }
        this._persistLogs();
      }
    } catch {
      this._consecutiveFailures++;
      this._setBackoff();
      if (this._consecutiveFailures < TellingLogger._maxConsecutiveFailures) {
        this._buffer.push(...eventsToSend);
      }
      this._persistLogs();
    }
  }

  private _setBackoff(): void {
    const backoffSeconds = 5 * Math.pow(2, this._consecutiveFailures - 1);
    this._nextRetryTime = new Date(Date.now() + backoffSeconds * 1000);
  }

  private async _persistLogs(): Promise<void> {
    try {
      const logsJson = this._buffer.map((e) => JSON.stringify(logEventToJson(e)));
      await setStringList(STORAGE_KEYS.LOGS_BUFFER, logsJson);
    } catch (error) {
      if (this._enableDebugLogs) {
        console.log('Telling: Failed to persist logs:', error);
      }
    }
  }

  private async _loadPersistedLogs(): Promise<void> {
    try {
      const logsJson = await getStringList(STORAGE_KEYS.LOGS_BUFFER);
      if (logsJson && logsJson.length > 0) {
        if (this._enableDebugLogs) {
          console.log(`Telling: Found ${logsJson.length} unsent logs`);
        }
        for (const logString of logsJson) {
          try {
            const event = logEventFromJson(JSON.parse(logString));
            this._buffer.push(event);
          } catch {
            // Skip malformed logs
          }
        }
        this._flush();
      }
    } catch (error) {
      if (this._enableDebugLogs) {
        console.log('Telling: Failed to load persisted logs:', error);
      }
    }
  }

  private _startNewSession(): void {
    this._clearBreadcrumbs();

    this._currentSession = {
      sessionId: this._generateSessionId(),
      startTime: new Date(),
      userId: this._userId,
      userName: this._userName,
      userEmail: this._userEmail,
    };

    if (this._enableDebugLogs) {
      console.log(`Telling: Started session ${this._currentSession.sessionId}`);
    }

    this.log('Session started', {
      level: LogLevel.Info,
      type: LogType.Analytics,
      metadata: {
        sessionId: this._currentSession.sessionId,
        startTime: this._currentSession.startTime.toISOString(),
      },
    });
  }

  private _endSession(): void {
    if (this._currentSession && isSessionActive(this._currentSession)) {
      this._currentSession.endTime = new Date();

      if (this._enableDebugLogs) {
        const duration = getSessionDuration(this._currentSession);
        console.log(`Telling: Ended session ${this._currentSession.sessionId} (${duration}s)`);
      }

      this.log('Session ended', {
        level: LogLevel.Info,
        type: LogType.Analytics,
        metadata: sessionToJson(this._currentSession),
      });

      this._flush();
    }
  }

  private _generateSessionId(): string {
    const timestamp = Date.now();
    const userPrefix = this._userId ?? 'anon';
    return `${userPrefix}_${timestamp}`;
  }

  private _setupAppLifecycleListeners(): void {
    this._appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        this._onAppPaused();
      } else if (nextState === 'active') {
        this._onAppResumed();
      }
    });
  }

  private _onAppPaused(): void {
    this._lastBackgroundTime = new Date();
    this._flush();
  }

  private _onAppResumed(): void {
    if (this._lastBackgroundTime) {
      const timeInBackground = Date.now() - this._lastBackgroundTime.getTime();

      if (timeInBackground > TellingLogger._sessionTimeout) {
        if (this._enableDebugLogs) {
          console.log(`Telling: Session timed out. Starting new session.`);
        }
        this._endSession();
        this._startNewSession();
      }
      this._lastBackgroundTime = undefined;
    }
  }

  private _addBreadcrumb(message: string, metadata?: Record<string, unknown>): void {
    if (!this._initialized) return;

    const breadcrumb: Record<string, unknown> = {
      message,
      timestamp: new Date().toISOString(),
      ...metadata,
    };

    this._breadcrumbs.push(breadcrumb);

    if (this._breadcrumbs.length > TellingLogger._maxBreadcrumbs) {
      this._breadcrumbs.shift();
    }
  }

  private _clearBreadcrumbs(): void {
    this._breadcrumbs = [];
  }

  dispose(): void {
    if (this._flushTimer) clearInterval(this._flushTimer);
    if (this._cleanupTimer) clearInterval(this._cleanupTimer);
    if (this._appStateSubscription) this._appStateSubscription.remove();
  }
}

export { TellingLogger };
export type { InitOptions, LogOptions, FunnelOptions, ExceptionOptions, UserOptions };
