<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { api, type ApiError } from '@/api/client';
import { asApiError } from '@/api/errors';
import type { Order } from '@/api/types';
import OrderSummary from '@/components/checkout/OrderSummary.vue';
import SimpleHeader from '@/components/layout/SimpleHeader.vue';
import OrderProgress from '@/components/order/OrderProgress.vue';
import InlineError from '@/components/ui/InlineError.vue';
import { FINAL_STATUSES, STATUS_LABELS } from '@/content/order-status';
import { formatWatClock } from '@/utils/format';

type TrackedOrder = Omit<Order, 'id'>;

const REFRESH_MS = 20_000;
const IN_PROGRESS = new Set(['paid', 'preparing', 'ready', 'out_for_delivery']);
const DONE = new Set(['delivered', 'collected']);

const route = useRoute();
const order = ref<TrackedOrder | null>(null);
const loadError = ref<ApiError | null>(null);
/** A background refresh failed; the last known order stays on screen. */
const refreshFailed = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

const token = computed(() => String(route.params.token));
const inProgress = computed(() => !!order.value && IN_PROGRESS.has(order.value.status));
const showProgress = computed(
  () => inProgress.value || (!!order.value && DONE.has(order.value.status)),
);
const wasPaid = computed(() => order.value?.payment?.status === 'success');

function schedule(ms = REFRESH_MS): void {
  clearTimeout(timer);
  if (order.value && FINAL_STATUSES.has(order.value.status)) return;
  timer = setTimeout(() => void refresh(), ms);
}

async function load(): Promise<void> {
  loadError.value = null;
  try {
    order.value = await api.get<TrackedOrder>(`/orders/track/${encodeURIComponent(token.value)}`);
    schedule();
  } catch (err) {
    loadError.value = asApiError(err);
  }
}

async function refresh(): Promise<void> {
  try {
    order.value = await api.get<TrackedOrder>(`/orders/track/${encodeURIComponent(token.value)}`);
    refreshFailed.value = false;
    schedule();
  } catch (err) {
    const error = asApiError(err);
    refreshFailed.value = true;
    schedule(error.retryAfter ? error.retryAfter * 1000 : REFRESH_MS);
  }
}

onMounted(load);
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <SimpleHeader />
  <main class="track-page">
    <section v-if="loadError?.kind === 'notFound'" class="card">
      <h1>We couldn’t find this order.</h1>
      <p class="muted">
        Check the link in your confirmation email — it needs to be copied in full.
      </p>
      <RouterLink to="/" class="btn-primary" data-test="home">Back to the menu</RouterLink>
    </section>

    <InlineError
      v-else-if="loadError"
      title="We couldn’t load this order."
      :error="loadError"
      @retry="load"
    />

    <p v-else-if="!order" class="muted" aria-busy="true">Loading your order…</p>

    <template v-else>
      <p class="eyebrow eyebrow--crimson">Track your order</p>
      <h1>Order {{ order.orderNumber }}</h1>
      <p class="status" aria-live="polite">
        <span class="pill">{{ STATUS_LABELS[order.status] ?? order.status }}</span>
      </p>

      <p v-if="refreshFailed" class="muted small" role="status">
        We couldn’t refresh this page. We’ll keep trying.
      </p>

      <section v-if="showProgress" class="card progress-card">
        <OrderProgress :status="order.status" :fulfilment="order.fulfilment" />
        <p v-if="inProgress && order.estimatedReadyAt" class="eta">
          {{ order.fulfilment === 'delivery' ? 'Estimated arrival' : 'Ready for pickup by' }}:
          <strong>{{ formatWatClock(order.estimatedReadyAt) }}</strong>
        </p>
        <p v-if="inProgress" class="muted small">This page updates by itself.</p>
      </section>

      <div v-if="order.status === 'cancelled'" class="notice" role="alert">
        <p>This order was cancelled.</p>
      </div>
      <div
        v-else-if="order.status === 'payment_failed' || order.status === 'expired'"
        class="notice"
        role="alert"
      >
        <p>This order wasn’t paid, so it didn’t go to the kitchen. You have not been charged.</p>
      </div>
      <div v-else-if="order.status === 'awaiting_payment'" class="notice">
        <p>We’re waiting for payment. The kitchen starts once it’s confirmed.</p>
      </div>

      <div class="grid">
        <section class="card">
          <h2>Your order</h2>
          <OrderSummary
            :lines="order.items"
            :subtotal-kobo="order.subtotalKobo"
            :delivery-fee-kobo="order.deliveryFeeKobo"
            :total-kobo="order.totalKobo"
            :fulfilment="order.fulfilment"
            :total-label="wasPaid ? 'Total paid' : 'Total'"
          />
        </section>
        <section class="card">
          <p class="eyebrow eyebrow--crimson">
            {{ order.fulfilment === 'delivery' ? 'Delivering to' : 'Pick up at' }}
          </p>
          <p>
            <strong>{{ order.contact.fullName }}</strong
            ><br />
            <template v-if="order.delivery">
              {{ order.delivery.streetAddress }}<br />
              {{ order.delivery.city }}, Cross River State<br />
            </template>
            <template v-else>Mustard Seed, {{ order.branch.city }}<br /></template>
            {{ order.contact.phone }}
          </p>
        </section>
      </div>
    </template>
  </main>
</template>

<style scoped>
.track-page {
  max-width: var(--page-width);
  margin: 0 auto;
  padding: 2rem var(--gutter) 4rem;
}
h1 {
  margin: 0.25rem 0 0.75rem;
  font-size: clamp(2rem, 4vw, 2.5rem);
}
h2 {
  margin: 0 0 1rem;
  font-size: 1.5rem;
}
.pill {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: var(--radius-pill);
  background: var(--color-charcoal);
  color: var(--color-gold);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.muted {
  color: var(--color-text-muted);
}
.small {
  font-size: 0.8125rem;
}
.card {
  padding: 1.5rem;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}
.progress-card {
  display: grid;
  gap: 1rem;
  margin: 1rem 0;
}
.eta {
  margin: 0;
  font-size: 1.0625rem;
}
.notice {
  margin: 1rem 0;
  padding: 1rem;
  border-left: 3px solid var(--color-crimson);
  background: var(--color-crimson-soft);
}
.notice p {
  margin: 0;
}
.btn-primary {
  text-decoration: none;
}
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 1rem;
  margin-top: 1.5rem;
  align-items: start;
}
@media (max-width: 860px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
