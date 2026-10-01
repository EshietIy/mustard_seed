import { ref, type App } from 'vue';

/** The last error nothing else handled. When set, the app shows the recovery screen. */
export const globalError = ref<unknown>(null);

export function resetGlobalError(): void {
  globalError.value = null;
}

/**
 * Catches anything that escapes component boundaries: errors the Vue error handler sees and
 * unhandled promise rejections. Nothing is left as a silent failure or blank screen.
 */
export function installGlobalErrorHandling(app: App, target: EventTarget = window): void {
  app.config.errorHandler = (err) => {
    globalError.value = err;
  };
  target.addEventListener('unhandledrejection', (event) => {
    event.preventDefault();
    globalError.value = (event as PromiseRejectionEvent).reason;
  });
}
