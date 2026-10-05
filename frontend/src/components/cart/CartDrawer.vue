<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import IconClose from '@/components/icons/IconClose.vue';
import IconMinus from '@/components/icons/IconMinus.vue';
import IconPlus from '@/components/icons/IconPlus.vue';
import { MAX_QUANTITY, useCartStore, type CartLine } from '@/stores/cart';
import { useSiteStore } from '@/stores/site';
import { formatNaira, priceLabel, PRICE_PLACEHOLDER } from '@/utils/format';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [value: boolean]; checkout: [] }>();

const cart = useCartStore();
const site = useSiteStore();
const closeButton = ref<HTMLButtonElement | null>(null);

const deliveryNote = computed(() =>
  site.info
    ? `Delivery is ${formatNaira(site.info.delivery.feeKobo)} anywhere in ${site.info.delivery.area}, or pick up for free.`
    : null,
);
const subtotal = computed(() =>
  cart.subtotalKobo === null ? PRICE_PLACEHOLDER : formatNaira(cart.subtotalKobo),
);

const hasChoiceProblems = computed(() => cart.lines.some((l) => l.needsChoice));

/** The line as people say it, e.g. "Afang Soup (Chicken)", for labels. */
const lineLabel = (line: CartLine) =>
  line.options.length ? `${line.name} (${line.options.map((o) => o.name).join(', ')})` : line.name;

const linePrice = (line: CartLine) =>
  line.priceKobo === null
    ? PRICE_PLACEHOLDER
    : priceLabel(
        line.options.reduce((sum, o) => sum + o.priceDeltaKobo, line.priceKobo) * line.quantity,
      );

function close(): void {
  emit('update:open', false);
}

// Escape must work wherever focus is (e.g. after the focused line was removed).
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close();
}

let opener: HTMLElement | null = null;

watch(
  () => props.open,
  async (open) => {
    if (open) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      window.addEventListener('keydown', onKeydown);
      await nextTick();
      closeButton.value?.focus();
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
  <div v-if="open" class="overlay" @click.self="close">
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
      <header class="head">
        <h2 id="cart-title">Your order</h2>
        <button
          ref="closeButton"
          type="button"
          class="icon-btn"
          aria-label="Close your order"
          @click="close"
        >
          <IconClose />
        </button>
      </header>

      <div v-if="cart.isEmpty" class="empty">
        <p class="empty-title">Your order is empty</p>
        <p>Add dishes and drinks from the menu to get started.</p>
      </div>

      <template v-else>
        <ul class="lines">
          <li v-for="line in cart.lines" :key="line.key" class="line">
            <div class="line-main">
              <p class="line-name">{{ line.name }}</p>
              <p v-if="line.options.length" class="line-options" data-test="line-options">
                {{ line.options.map((o) => o.name).join(' · ') }}
              </p>
              <p v-if="!line.isAvailable" class="sold-out">Sold out</p>
              <p v-else-if="line.needsChoice" class="sold-out">Choose again</p>
              <p v-else class="line-price">{{ linePrice(line) }}</p>
            </div>
            <div class="stepper">
              <button
                type="button"
                class="icon-btn"
                :aria-label="`Remove one ${lineLabel(line)}`"
                @click="cart.decrement(line.key)"
              >
                <IconMinus />
              </button>
              <span class="qty" aria-live="polite">{{ line.quantity }}</span>
              <button
                type="button"
                class="icon-btn"
                :aria-label="`Add one more ${lineLabel(line)}`"
                :disabled="!line.isAvailable || line.quantity >= MAX_QUANTITY"
                @click="cart.increment(line.key)"
              >
                <IconPlus />
              </button>
            </div>
          </li>
        </ul>

        <div class="summary">
          <p v-if="cart.hasUnavailable" class="warning" role="alert">
            Some items have sold out. Remove them to continue.
          </p>
          <p v-else-if="hasChoiceProblems" class="warning" role="alert">
            Some choices need updating. Remove those items and add them again with your choices.
          </p>
          <div class="row">
            <span>Subtotal</span>
            <strong data-test="subtotal">{{ subtotal }}</strong>
          </div>
          <p v-if="deliveryNote" class="note">{{ deliveryNote }}</p>
          <button
            type="button"
            class="btn-primary checkout"
            data-test="checkout"
            :disabled="cart.hasProblems"
            @click="emit('checkout')"
          >
            Checkout
          </button>
        </div>
      </template>
    </aside>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: color-mix(in srgb, var(--color-charcoal) 55%, transparent);
  display: flex;
  justify-content: flex-end;
}
.drawer {
  width: min(26rem, 100vw);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-cream);
  box-shadow: -12px 0 32px color-mix(in srgb, var(--color-charcoal) 25%, transparent);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.25rem 1rem;
  border-bottom: 1px solid var(--color-border);
}
h2 {
  margin: 0;
  font-size: 1.75rem;
}
.icon-btn {
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
.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.empty {
  padding: 2rem 1.25rem;
  color: var(--color-text-muted);
}
.empty-title {
  font-weight: 700;
  color: var(--color-text);
}
.lines {
  list-style: none;
  margin: 0;
  padding: 0.5rem 1.25rem;
  flex: 1;
  overflow-y: auto;
}
.line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.875rem 0;
  border-bottom: 1px solid var(--color-border);
}
.line-name {
  margin: 0;
  font-weight: 600;
}
.line-options {
  margin: 0.125rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
}
.line-price {
  margin: 0.125rem 0 0;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}
.sold-out {
  margin: 0.125rem 0 0;
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--color-crimson);
}
.stepper {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.qty {
  min-width: 1.5rem;
  text-align: center;
  font-weight: 700;
}
.summary {
  padding: 1rem 1.25rem 1.5rem;
  border-top: 1px solid var(--color-border);
  background: var(--color-white);
}
.row {
  display: flex;
  justify-content: space-between;
  font-size: 1rem;
}
.note {
  margin: 0.5rem 0 0;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}
.warning {
  margin: 0 0 0.75rem;
  padding: 0.5rem 0.75rem;
  border-left: 3px solid var(--color-crimson);
  background: var(--color-crimson-soft);
  font-size: 0.8125rem;
}
.checkout {
  width: 100%;
  margin-top: 1rem;
}
.checkout:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
