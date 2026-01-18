import { TellingLogger } from '../telling';

interface TryRunOptions<T> {
  context: string;
  metadata?: Record<string, unknown>;
  func: () => Promise<T>;
  onSuccess?: () => void;
  onError?: (error: Error, stack?: string) => void;
}

interface TryRunVoidOptions {
  context: string;
  metadata?: Record<string, unknown>;
  func: () => Promise<void>;
  onSuccess?: () => void;
  onError?: (error: Error, stack?: string) => void;
}

interface TryRunSyncOptions<T> {
  context: string;
  metadata?: Record<string, unknown>;
  func: () => T;
  onSuccess?: () => void;
  onError?: (error: Error, stack?: string) => void;
}

/**
 * Execute async function with automatic exception capture
 */
export async function tryRun<T>(options: TryRunOptions<T>): Promise<T | null> {
  try {
    const result = await options.func();
    options.onSuccess?.();
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    TellingLogger.instance.captureException({
      error: err,
      context: options.context,
      metadata: options.metadata,
    });
    options.onError?.(err, err.stack);
    return null;
  }
}

/**
 * Execute async void function with automatic exception capture
 */
export async function tryRunVoid(options: TryRunVoidOptions): Promise<void> {
  try {
    await options.func();
    options.onSuccess?.();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    TellingLogger.instance.captureException({
      error: err,
      context: options.context,
      metadata: options.metadata,
    });
    options.onError?.(err, err.stack);
  }
}

/**
 * Execute sync function with automatic exception capture
 */
export function tryRunSync<T>(options: TryRunSyncOptions<T>): T | null {
  try {
    const result = options.func();
    options.onSuccess?.();
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    TellingLogger.instance.captureException({
      error: err,
      context: options.context,
      metadata: options.metadata,
    });
    options.onError?.(err, err.stack);
    return null;
  }
}
