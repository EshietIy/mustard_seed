/**
 * Loads Google Identity Services (the "Sign in with Google" button) on demand.
 * The script is only fetched when someone opens sign-in, and a failed load can be retried.
 */
export const GIS_SRC = 'https://accounts.google.com/gsi/client';

export interface GoogleCredentialResponse {
  credential?: string;
  select_by?: string;
}

export interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  ux_mode?: 'popup' | 'redirect';
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  context?: 'signin' | 'signup' | 'use';
  itp_support?: boolean;
}

export interface GoogleButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number;
}

export interface GoogleAccountsId {
  initialize(config: GoogleIdConfiguration): void;
  renderButton(parent: HTMLElement, options: GoogleButtonOptions): void;
  cancel(): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

export class GoogleIdentityLoadError extends Error {
  constructor(reason: string) {
    super(`Google Identity Services could not load: ${reason}`);
    this.name = 'GoogleIdentityLoadError';
  }
}

let pending: Promise<GoogleAccountsId> | null = null;

/** Test helper: forget any previous load attempt. */
export function resetGoogleIdentityLoader(): void {
  pending = null;
}

export function loadGoogleIdentity(timeoutMs = 10_000): Promise<GoogleAccountsId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (pending) return pending;

  pending = new Promise<GoogleAccountsId>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;

    const fail = (reason: string) => {
      clearTimeout(timer);
      script.remove();
      pending = null; // allow a retry
      reject(new GoogleIdentityLoadError(reason));
    };
    const timer = setTimeout(() => fail('timed out'), timeoutMs);

    script.addEventListener('load', () => {
      const id = window.google?.accounts?.id;
      if (!id) {
        fail('script loaded without the Google API');
        return;
      }
      clearTimeout(timer);
      resolve(id);
    });
    script.addEventListener('error', () => fail('network error or blocked'));
    document.head.appendChild(script);
  });
  return pending;
}
