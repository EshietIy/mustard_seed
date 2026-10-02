/**
 * Full-page navigation to another site (the payment page). Wrapped so tests can intercept it.
 */
export const navigation = {
  assign(url: string): void {
    window.location.assign(url);
  },
};
