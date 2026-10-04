<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, type ApiError } from '@/api/client';
import { asApiError } from '@/api/errors';
import type { Order } from '@/api/types';
import OrderSummary from '@/components/checkout/OrderSummary.vue';
import SimpleHeader from '@/components/layout/SimpleHeader.vue';
import { STATUS_LABELS } from '@/content/order-status';
import InlineError from '@/components/ui/InlineError.vue';
import { useAuthStore } from '@/stores/auth';
import { useCartStore } from '@/stores/cart';
import { useMenuStore } from '@/stores/menu';
import { useToastStore } from '@/stores/toast';
import { formatNaira, formatWatClock } from '@/utils/format';
import { navigation } from '@/utils/navigation';

const POLL_MS = 3000;
const MAX_POLLS = 20;

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const cart = useCartStore();
const menu = useMenuStore();
const toast = useToastStore();

const order = ref<Order | null>(null);
const loadError = ref<ApiError | null>(null);
/** 'confirming': back from the payment page, asking the server what happened. */
const mode = ref<'view' | 'confirming' | 'confirm-error' | 'still-pending'>('view');
const confirmError = ref<ApiError | null>(null);
const paying = ref(false);
const payError = ref<ApiError | null>(null);
const notice = ref<string | null>(null);
let polls = 0;
let pollTimer: ReturnType<typeof setTimeout> | undefined;

const reference = computed(() =>
  typeof route.query.reference === 'string' ? route.query.reference : null,
);
const orderId = computed(() => String(route.params.id));
const canPay = computed(() => order.value?.status === 'awaiting_payment');
const deadline = computed(() => (order.value ? formatWatClock(order.value.paymentExpiresAt) : ''));

async function load(): Promise<void> {
  loadError.value = null;
  try {
    order.value = await api.get<Order>(`/orders/${orderId.value}`);
  } catch (err) {
    loadError.value = asApiError(err);
  }
}

/** Never assume the outcome from the redirect: ask the server, and poll while pending. */
async function confirm(): Promise<void> {
  if (!reference.value) return;
  mode.value = 'confirming';
  confirmError.value = null;
  try {
    order.value = await api.post<Order>('/payments/verify', { reference: reference.value });
  } catch (err) {
    confirmError.value = asApiError(err);
    mode.value = 'confirm-error';
    return;
  }
  if (order.value.status === 'awaiting_payment') {
    polls += 1;
    if (polls < MAX_POLLS) {
      pollTimer = setTimeout(() => void confirm(), POLL_MS);
    } else {
      mode.value = 'still-pending';
    }
    return;
  }
  mode.value = 'view';
  await router.replace({ path: route.path, query: {} });
}

function checkAgain(): void {
  polls = 0;
  void confirm();
}

async function payNow(): Promise<void> {
  if (!order.value) return;
  paying.value = true;
  payError.value = null;
  notice.value = null;
  try {
    const { authorizationUrl } = await api.post<{ authorizationUrl: string }>(
      `/orders/${order.value.id}/payments`,
    );
    navigation.assign(authorizationUrl);
  } catch (err) {
    const error = asApiError(err);
    if (error.kind === 'conflict') {
      notice.value = error.message;
      await load();
    } else if (error.kind !== 'unauthorized') {
      payError.value = error;
    }
    paying.value = false;
  }
}

async function orderAgain(): Promise<void> {
  if (!order.value) return;
  if (menu.status !== 'ready') await menu.load();
  let skipped = 0;
  for (const line of order.value.items) {
    const item = menu.allItems.find((i) => i.id === line.menuItemId);
    if (!item?.isAvailable) {
      skipped += 1;
      continue;
    }
    for (let i = 0; i < line.quantity; i++) cart.add(item);
  }
  if (skipped > 0) toast.show('Some items are no longer available and were left out.');
  await router.push('/checkout');
}

function start(): void {
  if (auth.status !== 'signed-in') return;
  if (reference.value) void confirm();
  else void load();
}

onMounted(start);
// Signing in from this page loads the order straight away.
watch(
  () => auth.status,
  (status) => {
    if (status === 'signed-in' && !order.value) start();
  },
);
onBeforeUnmount(() => clearTimeout(pollTimer));
</script>

<template>
  <SimpleHeader />
  <main class="order-page">
    <div v-if="auth.status === 'signed-out'" class="card">
      <p class="title">Sign in to see your order</p>
      <button type="button" class="btn-primary" @click="auth.openSignIn()">Sign in</button>
    </div>

    <section v-else-if="mode === 'confirming'" class="card confirming" aria-live="polite">
      <p class="eyebrow eyebrow--crimson">Payment</p>
      <h1>Confirming your payment…</h1>
      <p class="muted">This usually takes a few seconds. Please keep this page open.</p>
    </section>

    <InlineError
      v-else-if="mode === 'confirm-error'"
      title="We couldn’t confirm your payment yet."
      :error="confirmError"
      @retry="checkAgain"
    >
      <p class="muted">
        If you were charged, your order is safe — we’ll confirm it automatically. You won’t be
        charged twice.
      </p>
    </InlineError>

    <section v-else-if="mode === 'still-pending'" class="card" aria-live="polite">
      <p class="eyebrow eyebrow--crimson">Payment</p>
      <h1>We’re still waiting for your bank to confirm this payment.</h1>
      <p class="muted">
        Bank transfers can take a few minutes. Your order is held until
        {{ deadline }}, and you won’t be charged twice.
      </p>
      <button type="button" class="btn-primary" data-test="check-again" @click="checkAgain">
        Check again
      </button>
    </section>

    <InlineError
      v-else-if="loadError"
      title="We couldn’t show this order."
      :error="loadError"
      @retry="load"
    />

    <p v-else-if="!order" class="muted" aria-busy="true">Loading your order…</p>

    <template v-else>
      <p class="eyebrow eyebrow--crimson">Order received</p>
      <h1>Order {{ order.orderNumber }}</h1>
      <p class="status">
        <span class="pill">{{ STATUS_LABELS[order.status] ?? order.status }}</span>
      </p>

      <p v-if="notice" class="notice" role="alert">{{ notice }}</p>

      <div v-if="order.status === 'paid'" class="card success">
        <p class="success-title">
          Amedi, {{ auth.user?.firstName || 'friend' }}! Your order is in the kitchen.
        </p>
        <p class="muted">
          {{
            order.fulfilment === 'delivery'
              ? 'We’ll hand it to our rider as soon as it’s ready.'
              : 'We’ll have it ready for you to collect.'
          }}
        </p>
        <p v-if="order.estimatedReadyAt" class="eta">
          {{ order.fulfilment === 'delivery' ? 'Estimated arrival' : 'Ready for pickup by' }}:
          <strong>{{ formatWatClock(order.estimatedReadyAt) }}</strong>
        </p>
        <!-- This page, not the email, is the source of truth if the email is delayed. -->
        <p class="muted small">We’ll email your confirmation shortly.</p>
      </div>

      <div v-else-if="order.status === 'payment_failed'" class="notice" role="alert">
        <p>Your payment didn’t go through. You have not been charged.</p>
        <button type="button" class="btn-primary" data-test="order-again" @click="orderAgain">
          Order again
        </button>
      </div>

      <div v-else-if="order.status === 'expired'" class="notice" role="alert">
        <p>This order expired before it was paid. You have not been charged.</p>
        <button type="button" class="btn-primary" data-test="order-again" @click="orderAgain">
          Order again
        </button>
      </div>

      <div v-else-if="canPay" class="card pay">
        <p class="muted">Pay by {{ deadline }}, or this order will expire.</p>
        <button
          type="button"
          class="btn-primary"
          data-test="pay-now"
          :disabled="paying"
          @click="payNow"
        >
          {{ paying ? 'Opening the payment page…' : `Pay ${formatNaira(order.totalKobo)} now` }}
        </button>
        <p class="muted small">We start cooking as soon as your payment is confirmed.</p>
        <InlineError
          v-if="payError"
          title="We couldn’t open the payment page."
          :error="payError"
          @retry="payNow"
        />
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
            :total-label="order.status === 'paid' ? 'Total paid' : 'Total'"
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
.order-page {
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
.title {
  font-weight: 700;
}
.card {
  padding: 1.5rem;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}
.confirming {
  text-align: center;
}
.pay,
.success {
  margin: 1rem 0;
  display: grid;
  gap: 0.75rem;
  justify-items: start;
}
.success {
  border-left: 4px solid var(--color-gold);
}
.eta {
  margin: 0;
  font-size: 1.0625rem;
}
.success-title {
  margin: 0;
  font-family: var(--font-heading);
  font-size: 1.5rem;
  font-weight: 600;
}
.notice {
  margin: 1rem 0;
  padding: 1rem;
  border-left: 3px solid var(--color-crimson);
  background: var(--color-crimson-soft);
}
.notice p {
  margin: 0 0 0.75rem;
}
.btn-primary:disabled {
  opacity: 0.6;
  cursor: progress;
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
