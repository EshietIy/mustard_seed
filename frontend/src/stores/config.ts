import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api, ApiError } from '@/api/client';

export type PaymentMode = 'simulated' | 'live';

export const useConfigStore = defineStore('config', () => {
  const paymentMode = ref<PaymentMode | null>(null);
  const googleClientId = ref<string | null>(null);
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const error = ref<ApiError | null>(null);

  const isTestMode = computed(() => paymentMode.value === 'simulated');

  async function load(): Promise<void> {
    status.value = 'loading';
    error.value = null;
    try {
      const config = await api.get<{ paymentMode: PaymentMode; googleClientId?: string }>(
        '/config/public',
      );
      paymentMode.value = config.paymentMode;
      googleClientId.value = config.googleClientId ?? null;
      status.value = 'ready';
    } catch (err) {
      error.value =
        err instanceof ApiError
          ? err
          : new ApiError({ kind: 'unknown', message: 'Could not load settings.' });
      status.value = 'error';
    }
  }

  return { paymentMode, googleClientId, status, error, isTestMode, load };
});
