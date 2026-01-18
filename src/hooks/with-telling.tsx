import React, { useEffect, useRef } from 'react';
import { TellingLogger } from '../telling';
import { LogLevel, LogType } from '../models';

interface WithTellingOptions<P> {
  name?: string;
  type?: LogType;
  level?: LogLevel;
  metadata?: Record<string, unknown> | ((props: P) => Record<string, unknown>);
  trackOnce?: boolean;
}

/**
 * HOC for tracking component visibility
 */
export function withTelling<P extends object>(
  Component: React.ComponentType<P>,
  options: WithTellingOptions<P> = {}
): React.FC<P> {
  const {
    name,
    type = LogType.Analytics,
    level = LogLevel.Info,
    metadata,
    trackOnce = true,
  } = options;

  const WrappedComponent: React.FC<P> = (props) => {
    const hasTracked = useRef(false);
    const displayName = name || Component.displayName || Component.name || 'Unknown';

    useEffect(() => {
      if (trackOnce && hasTracked.current) {
        return;
      }

      const resolvedMetadata = typeof metadata === 'function' ? metadata(props) : metadata;

      TellingLogger.instance.log(`View: ${displayName}`, {
        level,
        type,
        metadata: {
          widget: displayName,
          ...resolvedMetadata,
        },
      });

      hasTracked.current = true;
    }, trackOnce ? [] : [props]);

    return <Component {...props} />;
  };

  WrappedComponent.displayName = `withTelling(${Component.displayName || Component.name || 'Component'})`;

  return WrappedComponent;
}
