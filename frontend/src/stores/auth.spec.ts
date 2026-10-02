import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './auth';
import { useToastStore } from './toast';

const user = {
  id: 'u-1',
  email: 'ekaette@example.com',
  firstName: 'Ekaette',
  fullName: 'Ekaette Bassey',
  avatarUrl: null,
  role: 'customer',
};

function stub(...responses: Array<Response | Error>) {
  const fn = vi.fn();
  for (const r of responses) {
    if (r instanceof Error) fn.mockRejectedValueOnce(r);
    else fn.mockResolvedValueOnce(r);
  }
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('auth store', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('restores an existing session', async () => {
    const fetchMock = stub(Response.json({ user }));
    const auth = useAuthStore();
    expect(auth.status).toBe('unknown');
    await auth.loadSession();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api.test/api/v1/auth/me');
    expect(auth.status).toBe('signed-in');
    expect(auth.user?.firstName).toBe('Ekaette');
    expect(auth.initial).toBe('E');
  });

  it('treats 401, network failures and odd bodies as signed out, without an error', async () => {
    for (const r of [
      Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }),
      new TypeError('Failed to fetch'),
      Response.json({ paymentMode: 'live' }),
    ]) {
      setActivePinia(createPinia());
      stub(r);
      const auth = useAuthStore();
      await auth.loadSession();
      expect(auth.status).toBe('signed-out');
      expect(auth.user).toBeNull();
    }
  });

  it('signs in with a Google credential, closes the dialog and welcomes the user', async () => {
    const fetchMock = stub(Response.json({ user }));
    const auth = useAuthStore();
    auth.openSignIn();
    await expect(auth.signInWithCredential('google-cred')).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/auth/google');
    expect(init.body).toBe('{"credential":"google-cred"}');
    expect(auth.status).toBe('signed-in');
    expect(auth.signInOpen).toBe(false);
    expect(useToastStore().messages[0]?.text).toBe('Welcome, Ekaette.');
  });

  it('keeps the dialog open with a friendly error when sign-in fails', async () => {
    stub(
      Response.json(
        {
          error: {
            code: 'INVALID_GOOGLE_TOKEN',
            message: 'We couldn’t verify your Google sign-in.',
            requestId: 'r-1',
          },
        },
        { status: 401 },
      ),
    );
    const auth = useAuthStore();
    auth.openSignIn();
    await expect(auth.signInWithCredential('bad')).resolves.toBe(false);
    expect(auth.signInOpen).toBe(true);
    expect(auth.signInError?.message).toBe('We couldn’t verify your Google sign-in.');
    expect(auth.signInError?.requestId).toBe('r-1');
    expect(auth.status).not.toBe('signed-in');
  });

  it('signs out even if the request fails', async () => {
    stub(Response.json({ user }), new TypeError('offline'));
    const auth = useAuthStore();
    await auth.loadSession();
    await auth.signOut();
    expect(auth.status).toBe('signed-out');
    expect(auth.user).toBeNull();
    expect(useToastStore().messages.at(-1)?.text).toBe('You’ve signed out.');
  });

  it('on an unauthorized API response, signs out and asks the user to sign in again', async () => {
    stub(Response.json({ user }));
    const auth = useAuthStore();
    await auth.loadSession();
    auth.handleUnauthorized('/orders');
    expect(auth.status).toBe('signed-out');
    expect(auth.signInOpen).toBe(true);
    expect(auth.signInReason).toBe('expired');
  });

  it('ignores 401s from the auth endpoints themselves', () => {
    const auth = useAuthStore();
    auth.handleUnauthorized('/auth/me');
    auth.handleUnauthorized('/auth/google');
    expect(auth.signInOpen).toBe(false);
  });

  it('opening and closing the dialog resets errors', () => {
    const auth = useAuthStore();
    auth.openSignIn();
    expect(auth.signInReason).toBe('manual');
    auth.closeSignIn();
    expect(auth.signInOpen).toBe(false);
    expect(auth.signInError).toBeNull();
  });
});
