import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api, type ApiError } from '@/api/client';
import { asApiError } from '@/api/errors';
import type { SiteInfo } from '@/api/types';

export const useSiteStore = defineStore('site', () => {
  const info = ref<SiteInfo | null>(null);
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const error = ref<ApiError | null>(null);

  async function load(): Promise<void> {
    status.value = 'loading';
    error.value = null;
    try {
      info.value = await api.get<SiteInfo>('/site');
      status.value = 'ready';
    } catch (err) {
      error.value = asApiError(err);
      status.value = 'error';
    }
  }

  return { info, status, error, load };
});
