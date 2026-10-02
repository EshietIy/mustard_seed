<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, type ApiError } from '@/api/client';
import { asApiError } from '@/api/errors';
import type { Order } from '@/api/types';
import OrderSummary from '@/components/checkout/OrderSummary.vue';
import SimpleHeader from '@/components/layout/SimpleHeader.vue';
import InlineError from '@/components/ui/InlineError.vue';
import { useAuthStore } from '@/stores/auth';

const STATUS_LABELS: Record<string, string> = {
  awaiting_payment: 'Awaiting payment',
  paid: 'Paid — in the kitchen',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  collected: 'Collected',
  payment_failed: 'Payment failed',
  expired: 'Expired — not paid in time',
  cancelled: 'Cancelled',
};

const route = useRoute();
const auth = useAuthStore();
const order = ref<Order | null>(null);
const error = ref<ApiError | null>(null);
const loading = ref(false);

async function load(): Promise<void> {
  if (auth.status !== 'signed-in') return;
  loading.value = true;
  error.value = null;
  try {
    order.value = await api.get<Order>(`/orders/${String(route.params.id)}`);
  } catch (err) {
    error.value = asApiError(err);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
// Signing in from this page loads the order straight away.
watch(
  () => auth.status,
  (status) => {
    if (status === 'signed-in' && !order.value) void load();
  },
);
</script>

<template>
  <SimpleHeader />
  <main class="order-page">
    <div v-if="auth.status === 'signed-out'" class="card">
      <p class="title">Sign in to see your order</p>
      <button type="button" class="btn-primary" @click="auth.openSignIn()">Sign in</button>
    </div>

    <InlineError
      v-else-if="error"
      title="We couldn’t show this order."
      :error="error"
      @retry="load"
    />

    <p v-else-if="!order" class="muted" aria-busy="true">Loading your order…</p>

    <template v-else>
      <p class="eyebrow eyebrow--crimson">Order received</p>
      <h1>Order {{ order.orderNumber }}</h1>
      <p class="status">
        <span class="pill">{{ STATUS_LABELS[order.status] ?? order.status }}</span>
      </p>
      <p v-if="order.status === 'awaiting_payment'" class="muted">
        We start cooking as soon as your payment is confirmed. Online payment opens in the next
        update of this site.
      </p>

      <div class="grid">
        <section class="card">
          <h2>Your order</h2>
          <OrderSummary
            :lines="order.items"
            :subtotal-kobo="order.subtotalKobo"
            :delivery-fee-kobo="order.deliveryFeeKobo"
            :total-kobo="order.totalKobo"
            :fulfilment="order.fulfilment"
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
.title {
  font-weight: 700;
}
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 1rem;
  margin-top: 1.5rem;
  align-items: start;
}
.card {
  padding: 1.5rem;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}
@media (max-width: 860px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
