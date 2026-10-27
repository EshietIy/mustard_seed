<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, type ApiError } from '@/api/client';
import { asApiError } from '@/api/errors';
import type { Menu, SalesReport } from '@/api/types';
import ActionError from '@/components/admin/ActionError.vue';
import InlineError from '@/components/ui/InlineError.vue';
import { toCsv } from '@/utils/csv';
import { formatNaira, formatTime } from '@/utils/format';
import {
  periodDays,
  periodProblem,
  presetPeriod,
  PRESETS,
  watToday,
  type Period,
  type Preset,
} from '@/utils/report-period';

/**
 * Sales reports (AGENT.md 3.4), super admins only: what sold in a period, to plan stock, staff
 * and the menu. Only paid orders count, on the Calabar day and hour the payment cleared.
 */
type Rank = 'sold' | 'sales';

/** Opening hours: these always show, so a quiet hour is visible as a quiet hour. */
const OPEN_HOURS = { first: 8, last: 22 };
/** Longer periods are added up by month so the list stays readable. */
const MAX_DAY_ROWS = 92;

const status = ref<'loading' | 'ready' | 'error'>('loading');
const loadError = ref<ApiError | null>(null);
const periodError = ref<ApiError | string | null>(null);
const report = ref<SalesReport | null>(null);
const categoryLabels = ref<Record<string, string>>({});
const preset = ref<Preset | null>('last-30');
const period = ref<Period>(presetPeriod('last-30', watToday(new Date())));
const custom = ref<Period>({ ...period.value });
const rank = ref<Rank>('sold');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Calendar labels built by hand: browsers disagree on short month names ("Sep" or "Sept"). */
function dateParts(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return {
    day: d.getUTCDate(),
    month: MONTHS[d.getUTCMonth()]!,
    year: d.getUTCFullYear(),
    weekday: DAYS[d.getUTCDay()]!,
  };
}
/** "28 Sep 2026" */
const longDate = (date: string) => {
  const p = dateParts(date);
  return `${p.day} ${p.month} ${p.year}`;
};
/** "Tue 20 Oct" */
const shortDate = (date: string) => {
  const p = dateParts(date);
  return `${p.weekday} ${p.day} ${p.month}`;
};
/** "Jan 2026" */
const monthName = (date: string) => {
  const p = dateParts(date);
  return `${p.month} ${p.year}`;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const hourLabel = (hour: number) => formatTime(`${String(hour).padStart(2, '0')}:00`);
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const categoryLabel = (id: string | null) => (id ? (categoryLabels.value[id] ?? '') : '');
/** Kobo as plain naira for spreadsheets: 320050 → "3200.50" (no floating point). */
const csvNaira = (kobo: number) =>
  `${Math.floor(kobo / 100)}.${String(kobo % 100).padStart(2, '0')}`;
/** Bar length as a share of the biggest value. */
const share = (value: number, max: number) => `${max > 0 ? Math.round((value / max) * 100) : 0}%`;

const periodLabel = computed(() =>
  report.value ? `${longDate(report.value.from)} – ${longDate(report.value.to)}` : '',
);

const tiles = computed(() => {
  const s = report.value?.summary;
  if (!s) return [];
  return [
    { label: 'Sales', value: formatNaira(s.salesKobo) },
    { label: 'Paid orders', value: String(s.orders) },
    { label: 'Average order', value: formatNaira(s.averageOrderKobo) },
    { label: 'Items sold', value: String(s.itemsSold) },
    { label: 'Delivery / pickup', value: `${s.deliveryOrders} / ${s.pickupOrders}` },
    { label: 'Delivery fees', value: formatNaira(s.deliveryFeesKobo) },
  ];
});

const unpaidNote = computed(() => {
  const unpaid = report.value?.summary.unpaid;
  if (!unpaid) return null;
  const total = unpaid.paymentFailed + unpaid.expired;
  if (total === 0) return null;
  const parts = [
    unpaid.paymentFailed && `${plural(unpaid.paymentFailed, 'payment')} failed`,
    unpaid.expired && `${unpaid.expired} ran out of time`,
  ].filter(Boolean);
  const lead = total === 1 ? '1 more order was' : `${total} more orders were`;
  return `${lead} placed but not paid: ${parts.join(', ')}.`;
});

const bestSellers = computed(() => {
  const dishes = [...(report.value?.dishes ?? [])];
  if (rank.value === 'sales') {
    dishes.sort(
      (a, b) =>
        b.salesKobo - a.salesKobo || b.quantity - a.quantity || a.name.localeCompare(b.name),
    );
  }
  const max = Math.max(
    0,
    ...dishes.map((d) => (rank.value === 'sales' ? d.salesKobo : d.quantity)),
  );
  return dishes.map((d) => ({
    ...d,
    bar: share(rank.value === 'sales' ? d.salesKobo : d.quantity, max),
  }));
});

const timeline = computed(() => {
  const r = report.value;
  const days = r?.days ?? [];
  const byMonth = r ? periodDays(r) > MAX_DAY_ROWS : false;
  const rows: Array<{ key: string; label: string; orders: number; salesKobo: number }> = [];
  for (const d of days) {
    const key = byMonth ? d.date.slice(0, 7) : d.date;
    const last = rows.at(-1);
    if (last?.key === key) {
      last.orders += d.orders;
      last.salesKobo += d.salesKobo;
    } else {
      rows.push({
        key,
        label: byMonth ? monthName(d.date) : shortDate(d.date),
        orders: d.orders,
        salesKobo: d.salesKobo,
      });
    }
  }
  const max = Math.max(0, ...rows.map((r) => r.salesKobo));
  return { byMonth, rows: rows.map((r) => ({ ...r, bar: share(r.salesKobo, max) })) };
});

const hours = computed(() => {
  const all = report.value?.hours ?? [];
  const max = Math.max(0, ...all.map((h) => h.orders));
  return all
    .filter((h) => (h.hour >= OPEN_HOURS.first && h.hour <= OPEN_HOURS.last) || h.orders > 0)
    .map((h) => ({ ...h, label: hourLabel(h.hour), bar: share(h.orders, max) }));
});

const weekdays = computed(() => {
  const all = report.value?.weekdays ?? [];
  const max = Math.max(0, ...all.map((w) => w.orders));
  return all.map((w) => ({ ...w, label: capitalise(w.weekday), bar: share(w.orders, max) }));
});

const busiest = computed(() => {
  const r = report.value;
  if (!r || r.summary.orders === 0) return null;
  const day = r.weekdays.reduce((a, b) => (b.orders > a.orders ? b : a));
  const hour = r.hours.reduce((a, b) => (b.orders > a.orders ? b : a));
  return `Busiest: ${capitalise(day.weekday)}s, and ${hourLabel(hour.hour)} to ${hourLabel((hour.hour + 1) % 24)}.`;
});

async function loadCategories(): Promise<void> {
  try {
    const menu = await api.get<Menu>('/menu');
    categoryLabels.value = Object.fromEntries(menu.categories.map((c) => [c.id, c.label]));
  } catch {
    // Labels are a nicety: the report still makes sense without them.
  }
}

async function load(): Promise<void> {
  status.value = 'loading';
  loadError.value = null;
  periodError.value = null;
  const { from, to } = period.value;
  try {
    const params = new URLSearchParams({ from, to });
    report.value = await api.get<SalesReport>(`/admin/reports/sales?${params.toString()}`);
    status.value = 'ready';
  } catch (err) {
    const apiError = asApiError(err);
    if (apiError.code === 'INVALID_DATE_RANGE' || apiError.code === 'VALIDATION_FAILED') {
      periodError.value = apiError;
      report.value = null;
      status.value = 'ready';
    } else {
      loadError.value = apiError;
      status.value = 'error';
    }
  }
}

function choosePreset(id: Preset): void {
  preset.value = id;
  period.value = presetPeriod(id, watToday(new Date()));
  custom.value = { ...period.value };
  void load();
}

function chooseCustom(): void {
  const problem = periodProblem(custom.value);
  if (problem) {
    periodError.value = problem;
    return;
  }
  preset.value = null;
  period.value = { ...custom.value };
  void load();
}

function download(): void {
  const r = report.value;
  if (!r) return;
  const rows = [
    ['Rank', 'Dish', 'Category', 'Number sold', 'Sales (naira)', 'Orders'],
    ...bestSellers.value.map((d, i) => [
      i + 1,
      d.name,
      d.retired ? 'Retired' : categoryLabel(d.category),
      d.quantity,
      csvNaira(d.salesKobo),
      d.orders,
    ]),
  ];
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `best-sellers-${r.from}-to-${r.to}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

onMounted(() => {
  void loadCategories();
  void load();
});
</script>

<template>
  <section>
    <p class="eyebrow eyebrow--crimson">Staff area</p>
    <h1>Reports</h1>
    <p class="lead">
      What sold, when, and what didn’t. Only paid orders count, by the day and hour in Calabar when
      payment cleared.
    </p>

    <div class="card period">
      <div class="presets" role="group" aria-label="Period">
        <button
          v-for="p in PRESETS"
          :key="p.id"
          type="button"
          class="pill"
          :data-test="`preset-${p.id}`"
          :aria-pressed="preset === p.id ? 'true' : 'false'"
          @click="choosePreset(p.id)"
        >
          {{ p.label }}
        </button>
      </div>
      <form class="custom" data-test="custom" novalidate @submit.prevent="chooseCustom">
        <label class="field">
          <span>From</span>
          <input v-model="custom.from" type="date" data-test="from" />
        </label>
        <label class="field">
          <span>To</span>
          <input v-model="custom.to" type="date" data-test="to" />
        </label>
        <button type="submit" class="btn-primary btn-sm">Show</button>
      </form>
      <div v-if="periodError" data-test="period-error"><ActionError :error="periodError" /></div>
    </div>

    <p v-if="status === 'loading'" class="state" aria-busy="true">Loading the report…</p>

    <div v-else-if="status === 'error'" data-test="load-error">
      <InlineError title="We couldn’t load the report." :error="loadError" @retry="load" />
    </div>

    <template v-else-if="report">
      <p class="period-label">{{ periodLabel }}</p>

      <ul class="tiles">
        <li v-for="t in tiles" :key="t.label" class="tile" data-test="tile">
          <span class="tile-label">{{ t.label }}</span>
          <strong class="tile-value">{{ t.value }}</strong>
        </li>
      </ul>
      <p v-if="unpaidNote" class="note" data-test="unpaid">{{ unpaidNote }}</p>

      <p v-if="report.summary.orders === 0" class="state">No paid orders in this period.</p>

      <template v-else>
        <section class="card" aria-labelledby="best-heading">
          <div class="head">
            <h2 id="best-heading">Best sellers</h2>
            <div class="presets" role="group" aria-label="Rank by">
              <button
                type="button"
                class="pill"
                data-test="rank-sold"
                :aria-pressed="rank === 'sold' ? 'true' : 'false'"
                @click="rank = 'sold'"
              >
                Most sold
              </button>
              <button
                type="button"
                class="pill"
                data-test="rank-sales"
                :aria-pressed="rank === 'sales' ? 'true' : 'false'"
                @click="rank = 'sales'"
              >
                Highest sales
              </button>
              <button type="button" class="link" data-test="download" @click="download">
                Download CSV
              </button>
            </div>
          </div>
          <table class="table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Dish</th>
                <th scope="col">Category</th>
                <th scope="col" class="num">Sold</th>
                <th scope="col" class="num">Sales</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(d, i) in bestSellers" :key="d.menuItemId" data-test="best-seller">
                <td>{{ i + 1 }}</td>
                <td class="dish">
                  {{ d.name }}
                  <span v-if="d.retired" class="badge">Retired</span>
                  <span class="bar" aria-hidden="true"><span :style="{ width: d.bar }" /></span>
                </td>
                <td class="muted">{{ categoryLabel(d.category) }}</td>
                <td class="num">{{ d.quantity }}</td>
                <td class="num">{{ formatNaira(d.salesKobo) }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-if="report.options.length" class="card" aria-labelledby="options-heading">
          <h2 id="options-heading">Meats and other choices</h2>
          <table class="table">
            <thead>
              <tr>
                <th scope="col">Choice</th>
                <th scope="col">Option</th>
                <th scope="col" class="num">Chosen</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in report.options" :key="`${o.groupName}-${o.name}`" data-test="option">
                <td class="muted">{{ o.groupName }}</td>
                <td>{{ o.name }}</td>
                <td class="num">{{ o.quantity }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="card" aria-labelledby="timeline-heading">
          <h2 id="timeline-heading">{{ timeline.byMonth ? 'Sales by month' : 'Sales by day' }}</h2>
          <ul class="bars">
            <li v-for="row in timeline.rows" :key="row.key" data-test="day">
              <span class="bar-label">{{ row.label }}</span>
              <span class="bar" aria-hidden="true"><span :style="{ width: row.bar }" /></span>
              <span class="bar-value">
                {{ plural(row.orders, 'order') }} · {{ formatNaira(row.salesKobo) }}
              </span>
            </li>
          </ul>
        </section>

        <section class="card" aria-labelledby="busy-heading">
          <h2 id="busy-heading">Busiest times</h2>
          <p v-if="busiest" class="note" data-test="busiest">{{ busiest }}</p>
          <div class="split">
            <ul class="bars" aria-label="Orders by hour">
              <li v-for="h in hours" :key="h.hour" data-test="hour">
                <span class="bar-label">{{ h.label }}</span>
                <span class="bar" aria-hidden="true"><span :style="{ width: h.bar }" /></span>
                <span class="bar-value">{{ plural(h.orders, 'order') }}</span>
              </li>
            </ul>
            <ul class="bars" aria-label="Orders by weekday">
              <li v-for="w in weekdays" :key="w.weekday" data-test="weekday">
                <span class="bar-label">{{ w.label }}</span>
                <span class="bar" aria-hidden="true"><span :style="{ width: w.bar }" /></span>
                <span class="bar-value">{{ plural(w.orders, 'order') }}</span>
              </li>
            </ul>
          </div>
        </section>
      </template>

      <section v-if="report.unsoldDishes.length" class="card" aria-labelledby="unsold-heading">
        <h2 id="unsold-heading">Sold nothing in this period</h2>
        <ul class="unsold" data-test="unsold">
          <li v-for="d in report.unsoldDishes" :key="d.menuItemId">
            {{ d.name }} <span class="muted">{{ categoryLabel(d.category) }}</span>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
h1 {
  margin: 0.25rem 0 0.5rem;
  font-size: 2rem;
}
h2 {
  margin: 0 0 0.75rem;
  font-family: var(--font-body);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-gold);
}
.lead,
.state {
  margin: 0 0 1.5rem;
  color: var(--color-text-muted);
}
.card {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  overflow-x: auto;
}
.presets {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.pill {
  min-height: 2.25rem;
  padding: 0.375rem 0.875rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-white);
  color: var(--color-charcoal);
  font: 600 0.875rem var(--font-body);
  cursor: pointer;
}
.pill[aria-pressed='true'] {
  background: var(--color-charcoal);
  border-color: var(--color-charcoal);
  color: var(--color-cream);
}
.custom {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
  margin-top: 1rem;
}
.field {
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
  font-weight: 400;
}
.period-label {
  margin: 0 0 0.75rem;
  font-weight: 600;
}
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 0.75rem;
  margin: 0 0 0.75rem;
  padding: 0;
  list-style: none;
}
.tile {
  display: grid;
  gap: 0.25rem;
  padding: 0.875rem 1rem;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}
.tile-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
.tile-value {
  font-family: var(--font-heading);
  font-size: 1.5rem;
}
.note {
  margin: 0 0 1.5rem;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  margin-bottom: 0.75rem;
}
.head h2 {
  margin: 0;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.table th {
  padding: 0.375rem 0.5rem;
  text-align: left;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-border);
}
.table td {
  padding: 0.5rem;
  border-bottom: 1px solid var(--color-border);
  vertical-align: top;
}
.num {
  text-align: right;
  white-space: nowrap;
}
.dish {
  font-weight: 600;
  min-width: 9rem;
}
.muted {
  color: var(--color-text-muted);
  font-size: 0.8125rem;
}
.badge {
  margin-left: 0.25rem;
  padding: 0 0.375rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--color-text-muted);
}
.bar {
  display: block;
  height: 0.375rem;
  margin-top: 0.25rem;
  border-radius: 999px;
  background: var(--color-surface-soft);
  overflow: hidden;
}
.bar > span {
  display: block;
  height: 100%;
  background: var(--color-charcoal);
}
.bars {
  display: grid;
  gap: 0.375rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.8125rem;
}
.bars li {
  display: grid;
  grid-template-columns: 5.5rem 1fr auto;
  align-items: center;
  gap: 0.75rem;
}
.bars .bar {
  margin-top: 0;
  height: 0.5rem;
}
.bar-value {
  color: var(--color-text-muted);
  white-space: nowrap;
}
.split {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 1.5rem;
}
.unsold {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-crimson);
  font: 600 0.875rem var(--font-body);
  text-decoration: underline;
  cursor: pointer;
}
</style>
