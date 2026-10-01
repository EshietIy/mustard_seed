import { describe, expect, it } from 'vitest';
import { createApp } from 'vue';
import { globalError, installGlobalErrorHandling, resetGlobalError } from './global-error';

describe('installGlobalErrorHandling', () => {
  it('captures errors from the Vue error handler', () => {
    resetGlobalError();
    const app = createApp({});
    installGlobalErrorHandling(app, new EventTarget());
    const err = new Error('boom');
    app.config.errorHandler?.(err, null, 'render');
    expect(globalError.value).toBe(err);
  });

  it('captures unhandled promise rejections and stops the default report', () => {
    resetGlobalError();
    const target = new EventTarget();
    installGlobalErrorHandling(createApp({}), target);
    const event = new Event('unhandledrejection', { cancelable: true }) as Event & {
      reason?: unknown;
    };
    event.reason = new Error('lost promise');
    target.dispatchEvent(event);
    expect((globalError.value as Error).message).toBe('lost promise');
    expect(event.defaultPrevented).toBe(true);
  });
});
