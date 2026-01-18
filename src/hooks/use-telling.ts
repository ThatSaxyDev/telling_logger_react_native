import { useEffect, useRef } from 'react';
import { TellingLogger } from '../telling';
import { LogLevel, LogType } from '../models';

interface UseTellingOptions {
  type?: LogType;
  level?: LogLevel;
  metadata?: Record<string, unknown>;
  trackOnce?: boolean;
}

/**
 * Hook for tracking component visibility
 */
export function useTelling(name: string, options: UseTellingOptions = {}): void {
  const {
    type = LogType.Analytics,
    level = LogLevel.Info,
    metadata,
    trackOnce = true,
  } = options;

  const hasTracked = useRef(false);

  useEffect(() => {
    if (trackOnce && hasTracked.current) {
      return;
    }

    TellingLogger.instance.log(`View: ${name}`, {
      level,
      type,
      metadata: {
        widget: name,
        ...metadata,
      },
    });

    hasTracked.current = true;
  }, trackOnce ? [] : [name, JSON.stringify(metadata)]);
}
