<script setup lang="ts">
import type { Fulfilment } from '@/api/types';
import { formatNaira, priceLabel } from '@/utils/format';

defineProps<{
  lines: Array<{
    menuItemId: string;
    name: string;
    quantity: number;
    lineTotalKobo: number | null;
  }>;
  subtotalKobo: number | null;
  deliveryFeeKobo: number;
  totalKobo: number | null;
  fulfilment: Fulfilment;
  totalLabel?: string;
}>();
</script>

<template>
  <div class="summary">
    <ul class="lines">
      <li v-for="line in lines" :key="line.menuItemId" class="line">
        <span>{{ line.quantity }} × {{ line.name }}</span>
        <span>{{ priceLabel(line.lineTotalKobo) }}</span>
      </li>
    </ul>
    <dl class="totals">
      <div class="row">
        <dt>Subtotal</dt>
        <dd>{{ priceLabel(subtotalKobo) }}</dd>
      </div>
      <div class="row">
        <dt>{{ fulfilment === 'delivery' ? 'Delivery (anywhere in Calabar)' : 'Pickup' }}</dt>
        <dd>{{ deliveryFeeKobo === 0 ? 'Free' : formatNaira(deliveryFeeKobo) }}</dd>
      </div>
      <div class="row total">
        <dt>{{ totalLabel ?? 'Total' }}</dt>
        <dd data-test="total">{{ priceLabel(totalKobo) }}</dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.lines {
  list-style: none;
  margin: 0;
  padding: 0;
}
.line,
.row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0;
}
.line {
  border-bottom: 1px solid var(--color-border);
}
.totals {
  margin: 0.5rem 0 0;
}
.row dt,
.row dd {
  margin: 0;
  color: var(--color-text-muted);
}
.total {
  margin-top: 0.25rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-border);
}
.total dt,
.total dd {
  color: var(--color-text);
  font-weight: 700;
  font-size: 1.0625rem;
}
</style>
