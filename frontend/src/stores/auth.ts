import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api, ApiError } from '@/api/client';
import { asApiError } from '@/api/errors';
import { useToastStore } from './toast';

export type Role = 'customer' | 'supervisor' | 'super_admin';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  fullName: string;
  avatarUrl: string | null;
  role: Role;
}

function isAuthUser(value: unknown): value is AuthUser {
  if (typeof value !== 'object' || value === null) return false;
  const u = value as Record<string, unknown>;
  return typeof u.id === 'string' && typeof u.email === 'string' && typeof u.role === 'string';
}

/**
 * Session state. The session itself lives in an HttpOnly cookie the page can't read; this store
 * only mirrors who is signed in, as reported by the API.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null);
  const status = ref<'unknown' | 'signed-in' | 'signed-out'>('unknown');
  const signInOpen = ref(false);
  const signInReason = ref<'manual' | 'expired'>('manual');
  const signInError = ref<ApiError | null>(null);
  const signingIn = ref(false);

  const initial = computed(() =>
    (user.value?.firstName || user.value?.email || '?').charAt(0).toUpperCase(),
  );

  function setUser(value: AuthUser | null): void {
    user.value = value;
    status.value = value ? 'signed-in' : 'signed-out';
  }

  async function loadSession(): Promise<void> {
    try {
      const res = await api.get<{ user?: unknown }>('/auth/me');
      setUser(isAuthUser(res.user) ? res.user : null);
    } catch {
      // Not signed in, or the API is unreachable: either way, browse as a guest.
      setUser(null);
    }
  }

  function openSignIn(reason: 'manual' | 'expired' = 'manual'): void {
    signInReason.value = reason;
    signInError.value = null;
    signInOpen.value = true;
  }

  function closeSignIn(): void {
    signInOpen.value = false;
    signInError.value = null;
  }

  async function signInWithCredential(credential: string): Promise<boolean> {
    signingIn.value = true;
    signInError.value = null;
    try {
      const res = await api.post<{ user?: unknown }>('/auth/google', { credential });
      if (!isAuthUser(res.user))
        throw new ApiError({ kind: 'unknown', message: 'Sign-in failed. Please try again.' });
      setUser(res.user);
      signInOpen.value = false;
      useToastStore().show(`Welcome, ${res.user.firstName || 'back'}.`);
      return true;
    } catch (err) {
      signInError.value = asApiError(err);
      return false;
    } finally {
      signingIn.value = false;
    }
  }

  async function signOut(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch {
      // The cookie may already be gone; locally we are signed out either way.
    }
    setUser(null);
    useToastStore().show('You’ve signed out.');
  }

  /** Any 401 from a protected call means the session ended: ask to sign in, keep the cart. */
  function handleUnauthorized(path: string): void {
    if (path.startsWith('/auth/')) return;
    setUser(null);
    openSignIn('expired');
  }

  return {
    user,
    status,
    initial,
    signInOpen,
    signInReason,
    signInError,
    signingIn,
    loadSession,
    openSignIn,
    closeSignIn,
    signInWithCredential,
    signOut,
    handleUnauthorized,
  };
});
