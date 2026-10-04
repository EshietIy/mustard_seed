const TRACKING_TOKEN = /(\/orders\/track\/)[^/?#]+/;

/** Tracking tokens grant access to an order's details, so they never reach the logs. */
export function redactUrl<T extends string | undefined>(url: T): T {
  return (url?.replace(TRACKING_TOKEN, '$1[REDACTED]') ?? url) as T;
}
