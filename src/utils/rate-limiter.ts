import { LogEvent, LogType } from '../models';

/**
 * Rate limiter to prevent log flooding and duplicate logs.
 * Matches Flutter SDK behavior exactly.
 */
export class LogRateLimiter {
  private _sentLogs = new Map<string, Date>();
  private _lastSentByType = new Map<string, Date>();
  private _logsThisSecond = 0;
  private _currentSecond?: Date;

  deduplicationWindow = 5000;
  throttleWindow = 1000;
  crashThrottleWindow = 5000;
  maxLogsPerSecond = 10;

  private _hashLog(event: LogEvent): string {
    const parts = [
      event.message,
      event.level,
      event.stackTrace ?? '',
      event.metadata ? JSON.stringify(event.metadata) : '',
    ];
    return this._simpleHash(parts.join('_'));
  }

  private _simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString();
  }

  private _getThrottleKey(event: LogEvent): string {
    return `${event.type}_${event.level}`;
  }

  shouldSendLog(event: LogEvent): boolean {
    const now = new Date();
    const hash = this._hashLog(event);
    const throttleKey = this._getThrottleKey(event);

    // Deduplication check
    const lastSent = this._sentLogs.get(hash);
    if (lastSent && now.getTime() - lastSent.getTime() < this.deduplicationWindow) {
      return false;
    }

    // Per-second rate limit
    if (!this._currentSecond || now.getTime() - this._currentSecond.getTime() >= 1000) {
      this._currentSecond = now;
      this._logsThisSecond = 0;
    }
    if (this._logsThisSecond >= this.maxLogsPerSecond) {
      return false;
    }

    // Crash-specific throttling
    if (event.type === LogType.Crash) {
      const lastSentOfType = this._lastSentByType.get(throttleKey);
      if (lastSentOfType && now.getTime() - lastSentOfType.getTime() < this.crashThrottleWindow) {
        return false;
      }
    }

    return true;
  }

  markLogSent(event: LogEvent): void {
    const now = new Date();
    const hash = this._hashLog(event);
    const throttleKey = this._getThrottleKey(event);

    this._sentLogs.set(hash, now);
    this._lastSentByType.set(throttleKey, now);
    this._logsThisSecond++;
  }

  cleanup(): void {
    const now = Date.now();
    const dedupeThreshold = now - this.deduplicationWindow * 2;
    const throttleThreshold = now - this.crashThrottleWindow * 2;

    for (const [hash, time] of this._sentLogs.entries()) {
      if (time.getTime() < dedupeThreshold) {
        this._sentLogs.delete(hash);
      }
    }

    for (const [key, time] of this._lastSentByType.entries()) {
      if (time.getTime() < throttleThreshold) {
        this._lastSentByType.delete(key);
      }
    }
  }
}
