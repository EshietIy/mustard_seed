<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api, ApiError } from '@/api/client';
import { asApiError } from '@/api/errors';
import type { Fulfilment, Order, Quote } from '@/api/types';
import OrderSummary from '@/components/checkout/OrderSummary.vue';
import SimpleHeader from '@/components/layout/SimpleHeader.vue';
import InlineError from '@/components/ui/InlineError.vue';
import { PLACEHOLDERS } from '@/content/landing';
import { useAuthStore } from '@/stores/auth';
import { useCartStore } from '@/stores/cart';
import { useSiteStore } from '@/stores/site';
import { formatNaira } from '@/utils/format';

const BRANCH_ID = 'calabar';

const auth = useAuthStore();
const cart = useCartStore();
const site = useSiteStore();
const router = useRouter();

const fulfilment = ref<Fulfilment>('delivery');
const form = reactive({ fullName: '', phone: '', streetAddress: '' });
const fieldErrors = ref<Record<string, string>>({});
const quote = ref<Quote | null>(null);
const quoteError = ref<ApiError | null>(null);
const quoteLoading = ref(false);
const submitting = ref(false);
const submitError = ref<ApiError | null>(null);
const notice = ref<string | null>(null);
// One id per checkout attempt: a retried submit can never create a second order.
const clientRequestId = crypto.randomUUID();

const calabar = computed(() => site.info?.branches.find((b) => b.id === BRANCH_ID) ?? null);
const deliveryFee = computed(() => (site.info ? formatNaira(site.info.delivery.feeKobo) : null));
const items = computed(() =>
  cart.lines.map((l) => ({
    menuItemId: l.itemId,
    quantity: l.quantity,
    ...(l.options.length ? { optionIds: l.options.map((o) => o.id) } : {}),
  })),
);
const blockingProblems = computed(() => quote.value?.problems ?? []);
const canSubmit = computed(
  () =>
    !!quote.value?.canPlaceOrder && !cart.hasProblems && !submitting.value && !quoteLoading.value,
);

async function loadQuote(): Promise<void> {
  if (cart.isEmpty) return;
  quoteLoading.value = true;
  quoteError.value = null;
  try {
    quote.value = await api.post<Quote>('/orders/quote', {
      fulfilment: fulfilment.value,
      branchId: BRANCH_ID,
      items: items.value,
    });
  } catch (err) {
    quoteError.value = asApiError(err);
  } finally {
    quoteLoading.value = false;
  }
}

/** Quick checks for a friendly first pass; the server validates everything again. */
function validate(): boolean {
  const errors: Record<string, string> = {};
  if (form.fullName.trim().length < 2) errors['contact.fullName'] = 'Enter the name for this order';
  if (!form.phone.trim())
    errors['contact.phone'] = 'Enter a phone number so the rider can reach you';
  if (fulfilment.value === 'delivery' && form.streetAddress.trim().length < 5) {
    errors['delivery.streetAddress'] = 'Enter your street address';
  }
  fieldErrors.value = errors;
  return Object.keys(errors).length === 0;
}

async function placeOrder(): Promise<void> {
  submitError.value = null;
  notice.value = null;
  if (!validate() || !quote.value?.totalKobo) return;
  submitting.value = true;
  try {
    const order = await api.post<Order>('/orders', {
      fulfilment: fulfilment.value,
      branchId: BRANCH_ID,
      items: items.value,
      contact: { fullName: form.fullName.trim(), phone: form.phone.trim() },
      ...(fulfilment.value === 'delivery'
        ? { delivery: { streetAddress: form.streetAddress.trim(), city: 'Calabar' } }
        : {}),
      expectedTotalKobo: quote.value.totalKobo,
      clientRequestId,
    });
    await router.push(`/orders/${order.id}`);
  } catch (err) {
    const error = asApiError(err);
    if (error.kind === 'validation' && error.fieldErrors) {
      fieldErrors.value = Object.fromEntries(
        Object.entries(error.fieldErrors).map(([field, messages]) => [field, messages[0] ?? '']),
      );
    } else if (error.kind === 'conflict' || error.status === 422) {
      // Prices, availability or hours changed: show the latest server view.
      notice.value = error.message;
      await loadQuote();
    } else if (error.kind !== 'unauthorized') {
      submitError.value = error;
    }
  } finally {
    submitting.value = false;
  }
}

const errorId = (field: string) => `${field.replace('.', '-')}-error`;

watch(fulfilment, () => void loadQuote());
watch(
  () => auth.user,
  (user) => {
    if (user && !form.fullName) form.fullName = user.fullName || user.firstName;
  },
  { immediate: true },
);

onMounted(() => {
  if (site.status === 'idle') void site.load();
  // The saved cart may have changed on another device: refresh before quoting.
  void cart.refresh().then(loadQuote);
});
</script>

<template>
  <SimpleHeader />
  <main class="checkout">
    <p class="eyebrow eyebrow--crimson">Checkout</p>
    <h1>Your order</h1>

    <div v-if="cart.isEmpty" class="card">
      <p class="empty-title">Your order is empty</p>
      <RouterLink to="/" class="btn-primary">Back to the menu</RouterLink>
    </div>

    <div v-else-if="auth.status !== 'signed-in'" class="card">
      <p class="empty-title">Sign in to place your order</p>
      <p class="muted">One tap with Google. Your order is saved on this device.</p>
      <button
        type="button"
        class="btn-primary"
        data-test="checkout-sign-in"
        @click="auth.openSignIn()"
      >
        Sign in
      </button>
    </div>

    <div v-else class="layout">
      <form class="card form" novalidate @submit.prevent="placeOrder">
        <fieldset class="choice">
          <legend>How would you like it?</legend>
          <label class="option" :class="{ selected: fulfilment === 'delivery' }">
            <input v-model="fulfilment" type="radio" name="fulfilment" value="delivery" />
            <span>
              <strong>Delivery</strong>
              <span class="muted">{{ deliveryFee ?? '' }} anywhere in Calabar</span>
            </span>
          </label>
          <label class="option" :class="{ selected: fulfilment === 'pickup' }">
            <input v-model="fulfilment" type="radio" name="fulfilment" value="pickup" />
            <span>
              <strong>Pickup</strong>
              <span class="muted">Free, at our Calabar restaurant</span>
            </span>
          </label>
        </fieldset>

        <div class="field">
          <label for="fullName">Name for the order</label>
          <input
            id="fullName"
            v-model="form.fullName"
            name="fullName"
            autocomplete="name"
            :aria-invalid="!!fieldErrors['contact.fullName']"
            :aria-describedby="
              fieldErrors['contact.fullName'] ? errorId('contact.fullName') : undefined
            "
          />
          <p
            v-if="fieldErrors['contact.fullName']"
            :id="errorId('contact.fullName')"
            class="field-error"
          >
            {{ fieldErrors['contact.fullName'] }}
          </p>
        </div>

        <div class="field">
          <label for="phone">Phone number</label>
          <input
            id="phone"
            v-model="form.phone"
            name="phone"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            placeholder="0803 123 4567"
            :aria-invalid="!!fieldErrors['contact.phone']"
            :aria-describedby="fieldErrors['contact.phone'] ? errorId('contact.phone') : undefined"
          />
          <p v-if="fieldErrors['contact.phone']" :id="errorId('contact.phone')" class="field-error">
            {{ fieldErrors['contact.phone'] }}
          </p>
        </div>

        <template v-if="fulfilment === 'delivery'">
          <div class="field">
            <label for="streetAddress">Street address</label>
            <textarea
              id="streetAddress"
              v-model="form.streetAddress"
              name="streetAddress"
              rows="2"
              autocomplete="street-address"
              placeholder="House number, street and a landmark"
              :aria-invalid="!!fieldErrors['delivery.streetAddress']"
              :aria-describedby="
                fieldErrors['delivery.streetAddress']
                  ? errorId('delivery.streetAddress')
                  : undefined
              "
            />
            <p
              v-if="fieldErrors['delivery.streetAddress']"
              :id="errorId('delivery.streetAddress')"
              class="field-error"
            >
              {{ fieldErrors['delivery.streetAddress'] }}
            </p>
          </div>
          <p class="muted">Calabar, Cross River State</p>
        </template>
        <div v-else class="pickup">
          <p class="eyebrow eyebrow--crimson">Pick up at</p>
          <p>
            {{ calabar?.streetAddress ?? PLACEHOLDERS.address('Calabar') }}<br />
            Calabar, Cross River State
          </p>
        </div>

        <p v-if="notice" class="notice" role="alert">{{ notice }}</p>
        <InlineError
          v-if="submitError"
          title="Your order was not placed."
          :error="submitError"
          @retry="placeOrder"
        />

        <button type="submit" class="btn-primary submit" :disabled="!canSubmit">
          {{ submitting ? 'Placing your order…' : 'Place order' }}
        </button>
        <p class="muted small">
          You’ll pay online next. We only start cooking once your payment is confirmed.
        </p>
      </form>

      <aside class="card">
        <h2>Summary</h2>
        <InlineError
          v-if="quoteError"
          title="We couldn’t work out your total."
          :error="quoteError"
          @retry="loadQuote"
        />
        <p v-else-if="!quote" class="muted" aria-busy="true">Working out your total…</p>
        <template v-else>
          <div v-if="blockingProblems.length" class="problems" role="alert">
            <p v-for="p in blockingProblems" :key="p.code + (p.menuItemId ?? '')">
              {{ p.message }}
            </p>
            <RouterLink to="/">Update your order</RouterLink>
          </div>
          <OrderSummary
            :lines="quote.lines"
            :subtotal-kobo="quote.subtotalKobo"
            :delivery-fee-kobo="quote.deliveryFeeKobo"
            :total-kobo="quote.totalKobo"
            :fulfilment="fulfilment"
          />
        </template>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.checkout {
  max-width: var(--page-width);
  margin: 0 auto;
  padding: 2rem var(--gutter) 4rem;
}
h1 {
  margin: 0.25rem 0 1.5rem;
  font-size: clamp(2rem, 4vw, 2.5rem);
}
h2 {
  margin: 0 0 1rem;
  font-size: 1.5rem;
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}
.card {
  padding: 1.5rem;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}
.empty-title {
  margin: 0 0 0.5rem;
  font-weight: 700;
}
.muted {
  color: var(--color-text-muted);
}
.small {
  font-size: 0.8125rem;
}
.form {
  display: grid;
  gap: 1rem;
}
.choice {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  border: 0;
}
legend {
  margin-bottom: 0.5rem;
  font-weight: 700;
}
.option {
  display: flex;
  gap: 0.625rem;
  align-items: flex-start;
  padding: 0.875rem;
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  cursor: pointer;
}
.option.selected {
  border-color: var(--color-crimson);
  background: var(--color-crimson-soft);
}
.option input {
  margin-top: 0.3rem;
  accent-color: var(--color-crimson);
}
.option span {
  display: grid;
}
.field {
  display: grid;
  gap: 0.375rem;
}
label {
  font-weight: 600;
  font-size: 0.875rem;
}
input:not([type='radio']),
textarea {
  width: 100%;
  padding: 0.75rem 0.875rem;
  border: 1px solid color-mix(in srgb, var(--color-charcoal) 25%, transparent);
  border-radius: 0.625rem;
  background: var(--color-white);
  color: var(--color-text);
  font: 1rem var(--font-body);
}
[aria-invalid='true'] {
  border-color: var(--color-crimson) !important;
}
.field-error {
  margin: 0;
  color: var(--color-crimson);
  font-size: 0.8125rem;
  font-weight: 600;
}
.pickup p {
  margin: 0.25rem 0 0;
}
.notice,
.problems {
  margin: 0 0 1rem;
  padding: 0.75rem 1rem;
  border-left: 3px solid var(--color-crimson);
  background: var(--color-crimson-soft);
  font-size: 0.875rem;
}
.problems p {
  margin: 0 0 0.25rem;
}
.problems a {
  color: var(--color-crimson);
  font-weight: 600;
}
.submit {
  width: 100%;
}
.submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-primary {
  text-decoration: none;
}
@media (max-width: 860px) {
  .layout {
    grid-template-columns: 1fr;
  }
  aside {
    order: -1;
  }
}
@media (max-width: 420px) {
  .choice {
    grid-template-columns: 1fr;
  }
}
</style>
