<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { api, type ApiError } from '@/api/client';
import { asApiError } from '@/api/errors';
import type { RestaurantSettings } from '@/api/types';
import ActionError from '@/components/admin/ActionError.vue';
import InlineError from '@/components/ui/InlineError.vue';
import { useToastStore } from '@/stores/toast';
import { formatNaira, formatTime } from '@/utils/format';
import { koboToInput, parseNairaInput } from '@/utils/naira-input';

/**
 * Settings (super admins only): the delivery fee and the opening hours. The next quote and
 * order use the new values at once; orders already placed keep the fee they were charged.
 */
type Part = 'fee' | 'hours';

/** ₦1,000,000, the API's limit: far above any real fee, so a slip of the keyboard is caught. */
const MAX_FEE_KOBO = 100_000_000;
const HOURS_FIELDS = {
  opensAt: 'Opens',
  onlineOrdersCloseAt: 'Online orders close',
  closesAt: 'Closes',
} as const;

const toast = useToastStore();
const status = ref<'loading' | 'ready' | 'error'>('loading');
const loadError = ref<ApiError | null>(null);
const settings = ref<RestaurantSettings | null>(null);
const fee = ref('');
const hours = reactive({ opensAt: '', onlineOrdersCloseAt: '', closesAt: '' });
const saving = reactive<Record<Part, boolean>>({ fee: false, hours: false });
const errors = reactive<Partial<Record<Part, ApiError | string>>>({});

function show(s: RestaurantSettings): void {
  settings.value = s;
  fee.value = koboToInput(s.deliveryFeeKobo);
  hours.opensAt = s.opensAt;
  hours.onlineOrdersCloseAt = s.onlineOrdersCloseAt;
  hours.closesAt = s.closesAt;
}

async function load(): Promise<void> {
  status.value = 'loading';
  loadError.value = null;
  try {
    show(await api.get<RestaurantSettings>('/admin/settings'));
    status.value = 'ready';
  } catch (err) {
    loadError.value = asApiError(err);
    status.value = 'error';
  }
}

/** The first field error, else the message (the server explains INVALID_HOURS in words). */
function explain(err: unknown): ApiError | string {
  const error = asApiError(err);
  const first = Object.values(error.fieldErrors ?? {})[0]?.[0];
  return error.code === 'VALIDATION_FAILED' && first ? first : error;
}

async function save(part: Part, patch: Partial<RestaurantSettings>, done: string): Promise<void> {
  delete errors[part];
  saving[part] = true;
  try {
    show(await api.patch<RestaurantSettings>('/admin/settings', patch));
    toast.show(done);
  } catch (err) {
    errors[part] = explain(err);
  } finally {
    saving[part] = false;
  }
}

function saveFee(): void {
  const parsed = parseNairaInput(fee.value, { maxKobo: MAX_FEE_KOBO, allowZero: true });
  if ('error' in parsed) {
    errors.fee = parsed.error.replace('no extra cost', 'free delivery');
    return;
  }
  const done =
    parsed.kobo === 0
      ? 'Delivery is free from the next order.'
      : `Delivery now costs ${formatNaira(parsed.kobo)} from the next order.`;
  void save('fee', { deliveryFeeKobo: parsed.kobo }, done);
}

/** The same rule as the server: online orders need a window inside opening hours. */
function hoursProblem(): string | null {
  for (const [key, label] of Object.entries(HOURS_FIELDS)) {
    if (!hours[key as keyof typeof hours]) return `Enter the time for “${label}”.`;
  }
  if (hours.onlineOrdersCloseAt <= hours.opensAt) {
    return 'The online order cut-off must be after opening time.';
  }
  if (hours.onlineOrdersCloseAt > hours.closesAt) {
    return 'The online order cut-off can’t be after closing time.';
  }
  return null;
}

function saveHours(): void {
  const problem = hoursProblem();
  if (problem) {
    errors.hours = problem;
    return;
  }
  void save(
    'hours',
    { ...hours },
    `Open ${formatTime(hours.opensAt)} – ${formatTime(hours.closesAt)}, online orders until ${formatTime(hours.onlineOrdersCloseAt)}.`,
  );
}

onMounted(load);
</script>

<template>
  <section>
    <p class="eyebrow eyebrow--crimson">Staff area</p>
    <h1>Settings</h1>
    <p class="lead">
      Changes reach the website and the app at once and apply from the next order. Orders already
      placed keep what they were charged.
    </p>

    <p v-if="status === 'loading'" class="state" aria-busy="true">Loading the settings…</p>

    <InlineError
      v-else-if="status === 'error'"
      title="We couldn’t load the settings."
      :error="loadError"
      @retry="load"
    />

    <template v-else-if="settings">
      <form
        class="card"
        data-test="fee-form"
        aria-labelledby="fee-heading"
        novalidate
        @submit.prevent="saveFee"
      >
        <h2 id="fee-heading">Delivery fee</h2>
        <p class="note">
          One price for delivery anywhere in {{ settings.deliveryArea }}. Pickup is always free.
          Enter 0 for free delivery.
        </p>
        <p class="current" data-test="current-fee">
          Now: {{ settings.deliveryFeeKobo === 0 ? 'Free' : formatNaira(settings.deliveryFeeKobo) }}
        </p>
        <div class="field">
          <span class="currency" aria-hidden="true">₦</span>
          <input
            v-model="fee"
            inputmode="decimal"
            autocomplete="off"
            data-test="fee"
            aria-label="Delivery fee in naira"
            :aria-invalid="errors.fee ? 'true' : undefined"
          />
          <button type="submit" class="btn-primary btn-sm" :disabled="saving.fee">Save fee</button>
        </div>
        <ActionError v-if="errors.fee" :error="errors.fee" />
      </form>

      <form
        class="card"
        data-test="hours-form"
        aria-labelledby="hours-heading"
        novalidate
        @submit.prevent="saveHours"
      >
        <h2 id="hours-heading">Opening hours</h2>
        <p class="note">
          Every day, Calabar time. Customers can order online from opening time until the cut-off.
        </p>
        <p class="current" data-test="current-hours">
          Now: open {{ formatTime(settings.opensAt) }} – {{ formatTime(settings.closesAt) }}, online
          orders until {{ formatTime(settings.onlineOrdersCloseAt) }}
        </p>
        <div class="times">
          <label v-for="(label, key) in HOURS_FIELDS" :key="key" class="time">
            <span>{{ label }}</span>
            <input
              v-model="hours[key]"
              type="time"
              step="300"
              :data-test="key"
              :aria-invalid="errors.hours ? 'true' : undefined"
            />
          </label>
        </div>
        <button type="submit" class="btn-primary btn-sm" :disabled="saving.hours">
          Save hours
        </button>
        <ActionError v-if="errors.hours" :error="errors.hours" />
      </form>
    </template>
  </section>
</template>

<style scoped>
h1 {
  margin: 0.25rem 0 0.5rem;
  font-size: 2rem;
}
.lead,
.state {
  margin: 0 0 1.5rem;
  color: var(--color-text-muted);
}
.card {
  display: grid;
  gap: 0.5rem;
  justify-items: start;
  margin-bottom: 1.25rem;
  padding: 1rem;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}
.card h2 {
  margin: 0;
  font-size: 1.375rem;
}
.note,
.current {
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}
.current {
  font-weight: 600;
  color: var(--color-text);
}
.field,
.times {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.5rem 1rem;
}
.currency {
  align-self: center;
  font-weight: 600;
}
.time {
  display: grid;
  gap: 0.25rem;
  font-size: 0.8125rem;
  font-weight: 600;
}
input {
  min-height: 2.25rem;
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
}
.field input {
  width: 7.5rem;
}
input[aria-invalid='true'] {
  border-color: var(--color-crimson);
}
</style>
