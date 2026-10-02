import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleIdentityLoadError, loadGoogleIdentity } from '@/auth/google-identity';
import { useAuthStore } from '@/stores/auth';
import { useConfigStore } from '@/stores/config';
import SignInDialog from './SignInDialog.vue';

vi.mock('@/auth/google-identity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/google-identity')>();
  return { ...actual, loadGoogleIdentity: vi.fn() };
});

enableAutoUnmount(afterEach);

const user = {
  id: 'u-1',
  email: 'ekaette@example.com',
  firstName: 'Ekaette',
  fullName: 'Ekaette Bassey',
  avatarUrl: null,
  role: 'customer',
};

function fakeGoogle() {
  let callback: ((r: { credential?: string }) => void) | undefined;
  const id = {
    initialize: vi.fn((cfg: { callback: (r: { credential?: string }) => void }) => {
      callback = cfg.callback;
    }),
    renderButton: vi.fn((el: HTMLElement) => {
      el.innerHTML = '<button>Google button</button>';
    }),
    cancel: vi.fn(),
    disableAutoSelect: vi.fn(),
  };
  return { id, respond: (credential?: string) => callback?.({ credential }) };
}

function ready(paymentClientId = 'client-123.apps.googleusercontent.com') {
  const config = useConfigStore();
  config.status = 'ready';
  config.googleClientId = paymentClientId;
}

describe('SignInDialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(loadGoogleIdentity).mockReset();
  });

  it('renders nothing while closed', () => {
    expect(mount(SignInDialog).find('[role="dialog"]').exists()).toBe(false);
  });

  it('renders the Google button with our client ID when opened', async () => {
    const google = fakeGoogle();
    vi.mocked(loadGoogleIdentity).mockResolvedValue(google.id);
    ready();
    useAuthStore().openSignIn();
    const wrapper = mount(SignInDialog, { attachTo: document.body });
    await flushPromises();
    expect(wrapper.get('[role="dialog"]').attributes('aria-modal')).toBe('true');
    expect(wrapper.get('h2').text()).toBe('Sign in to order');
    expect(google.id.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'client-123.apps.googleusercontent.com',
        ux_mode: 'popup',
      }),
    );
    expect(wrapper.text()).toContain('Google button');
  });

  it('signs in when Google returns a credential', async () => {
    const google = fakeGoogle();
    vi.mocked(loadGoogleIdentity).mockResolvedValue(google.id);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ user })));
    ready();
    const auth = useAuthStore();
    auth.openSignIn();
    mount(SignInDialog);
    await flushPromises();
    google.respond('google-cred');
    await flushPromises();
    expect(auth.status).toBe('signed-in');
    expect(auth.signInOpen).toBe(false);
  });

  it('shows the server error when sign-in is refused', async () => {
    const google = fakeGoogle();
    vi.mocked(loadGoogleIdentity).mockResolvedValue(google.id);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: 'EMAIL_NOT_VERIFIED',
              message: 'Your Google email address isn’t verified.',
            },
          },
          { status: 401 },
        ),
      ),
    );
    ready();
    useAuthStore().openSignIn();
    const wrapper = mount(SignInDialog);
    await flushPromises();
    google.respond('cred');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Your Google email address isn’t verified.',
    );
  });

  it('ignores an empty response (cancelled)', async () => {
    const google = fakeGoogle();
    vi.mocked(loadGoogleIdentity).mockResolvedValue(google.id);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    ready();
    useAuthStore().openSignIn();
    mount(SignInDialog);
    await flushPromises();
    google.respond(undefined);
    await flushPromises();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAuthStore().signInOpen).toBe(true);
  });

  it('explains when Google sign-in cannot load, and retries', async () => {
    const google = fakeGoogle();
    vi.mocked(loadGoogleIdentity)
      .mockRejectedValueOnce(new GoogleIdentityLoadError('blocked'))
      .mockResolvedValueOnce(google.id);
    ready();
    useAuthStore().openSignIn();
    const wrapper = mount(SignInDialog);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('We couldn’t load Google sign-in.');
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Google button');
  });

  it('explains when sign-in is not configured', async () => {
    const config = useConfigStore();
    config.status = 'error';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    useAuthStore().openSignIn();
    const wrapper = mount(SignInDialog);
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Sign-in isn’t available right now.');
    expect(loadGoogleIdentity).not.toHaveBeenCalled();
  });

  it('tells the customer their order is safe when the session expired', async () => {
    vi.mocked(loadGoogleIdentity).mockResolvedValue(fakeGoogle().id);
    ready();
    useAuthStore().openSignIn('expired');
    const wrapper = mount(SignInDialog);
    await flushPromises();
    expect(wrapper.text()).toContain(
      'Your session has expired. Sign in again — your order is saved.',
    );
  });

  it('closes on Escape and the close button', async () => {
    vi.mocked(loadGoogleIdentity).mockResolvedValue(fakeGoogle().id);
    ready();
    const auth = useAuthStore();
    auth.openSignIn();
    const wrapper = mount(SignInDialog, { attachTo: document.body });
    await flushPromises();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(auth.signInOpen).toBe(false);
    auth.openSignIn();
    await flushPromises();
    await wrapper.get('[aria-label="Close sign-in"]').trigger('click');
    expect(auth.signInOpen).toBe(false);
  });
});
