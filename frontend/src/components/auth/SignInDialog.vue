<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { ApiError } from '@/api/client';
import { loadGoogleIdentity, type GoogleCredentialResponse } from '@/auth/google-identity';
import IconClose from '@/components/icons/IconClose.vue';
import InlineError from '@/components/ui/InlineError.vue';
import { useAuthStore } from '@/stores/auth';
import { useConfigStore } from '@/stores/config';

const auth = useAuthStore();
const config = useConfigStore();

const buttonHost = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const state = ref<'loading' | 'ready' | 'unavailable' | 'load-failed'>('loading');

const UNAVAILABLE = new ApiError({
  kind: 'unknown',
  message: 'Please try again in a moment.',
});
const LOAD_FAILED = new ApiError({
  kind: 'network',
  message: 'Check your connection, or allow accounts.google.com if you use a content blocker.',
});

async function clientId(): Promise<string | null> {
  if (config.status !== 'ready') await config.load();
  return config.googleClientId;
}

function onCredential(response: GoogleCredentialResponse): void {
  // No credential means the popup was closed or the user cancelled: stay open, no error.
  if (response.credential) void auth.signInWithCredential(response.credential);
}

async function prepare(): Promise<void> {
  state.value = 'loading';
  const id = await clientId();
  if (!id) {
    state.value = 'unavailable';
    return;
  }
  try {
    const google = await loadGoogleIdentity();
    google.initialize({
      client_id: id,
      callback: onCredential,
      ux_mode: 'popup',
      auto_select: false,
      cancel_on_tap_outside: true,
      context: 'signin',
      itp_support: true,
    });
    state.value = 'ready';
    await nextTick();
    if (buttonHost.value) {
      google.renderButton(buttonHost.value, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        logo_alignment: 'left',
        width: 280,
      });
    }
  } catch {
    state.value = 'load-failed';
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') auth.closeSignIn();
}

let opener: HTMLElement | null = null;

watch(
  () => auth.signInOpen,
  async (open) => {
    if (open) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      window.addEventListener('keydown', onKeydown);
      await nextTick();
      closeButton.value?.focus();
      await prepare();
    } else {
      window.removeEventListener('keydown', onKeydown);
      opener?.focus();
      opener = null;
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div v-if="auth.signInOpen" class="overlay" @click.self="auth.closeSignIn()">
    <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="sign-in-title">
      <button
        ref="closeButton"
        type="button"
        class="close"
        aria-label="Close sign-in"
        @click="auth.closeSignIn()"
      >
        <IconClose />
      </button>
      <p class="eyebrow eyebrow--crimson">Amedi · Welcome</p>
      <h2 id="sign-in-title">Sign in to order</h2>
      <p v-if="auth.signInReason === 'expired'" class="notice">
        Your session has expired. Sign in again — your order is saved.
      </p>
      <p class="lead">One tap with your Google account. No new password to remember.</p>

      <InlineError
        v-if="state === 'unavailable'"
        title="Sign-in isn’t available right now."
        :error="UNAVAILABLE"
        @retry="prepare"
      />
      <InlineError
        v-else-if="state === 'load-failed'"
        title="We couldn’t load Google sign-in."
        :error="LOAD_FAILED"
        @retry="prepare"
      />
      <template v-else>
        <p v-if="state === 'loading'" class="loading" aria-busy="true">Loading Google sign-in…</p>
        <div v-show="state === 'ready' && !auth.signingIn" ref="buttonHost" class="google-button" />
        <p v-if="auth.signingIn" class="loading" aria-busy="true">Signing you in…</p>
        <InlineError
          v-if="auth.signInError"
          title="Sign-in didn’t work."
          :error="auth.signInError"
          @retry="prepare"
        />
      </template>

      <p class="fine-print">
        We only use your name and email to manage your orders and send your receipt.
      </p>
    </section>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 160;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: color-mix(in srgb, var(--color-charcoal) 55%, transparent);
}
.dialog {
  position: relative;
  width: min(26rem, 100%);
  padding: 2rem 1.5rem 1.5rem;
  border-radius: var(--radius-card);
  background: var(--color-cream);
  box-shadow: 0 16px 40px color-mix(in srgb, var(--color-charcoal) 30%, transparent);
  text-align: center;
}
.close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-white);
  color: var(--color-text);
  cursor: pointer;
}
h2 {
  margin: 0.5rem 0 0.75rem;
  font-size: 2rem;
}
.lead,
.loading {
  color: var(--color-text-muted);
}
.notice {
  margin: 0 0 0.75rem;
  padding: 0.5rem 0.75rem;
  border-left: 3px solid var(--color-crimson);
  background: var(--color-crimson-soft);
  text-align: left;
  font-size: 0.875rem;
}
.google-button {
  display: flex;
  justify-content: center;
  min-height: 44px;
  margin: 1.25rem 0;
}
.dialog :deep(.inline-error) {
  margin: 1rem 0;
  text-align: left;
}
.fine-print {
  margin: 1rem 0 0;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
</style>
