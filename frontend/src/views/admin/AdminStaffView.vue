<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { api, type ApiError } from '@/api/client';
import { asApiError } from '@/api/errors';
import type { StaffMember } from '@/api/types';
import { roleLabel, type StaffRole } from '@/admin/sections';
import ActionError from '@/components/admin/ActionError.vue';
import InlineError from '@/components/ui/InlineError.vue';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { formatWatDate } from '@/utils/format';

/**
 * Staff (AGENT.md 3.4), super admins only: who may use the staff area. People are added by the
 * Google email they sign in with. The server checks roles on every request, so changes apply at
 * once; it also refuses to leave the restaurant without an active super admin.
 */
type Action = 'role' | 'deactivate';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const auth = useAuthStore();
const toast = useToastStore();
const status = ref<'loading' | 'ready' | 'error'>('loading');
const loadError = ref<ApiError | null>(null);
const staff = ref<StaffMember[]>([]);
const busy = reactive<Record<string, boolean>>({});
const errors = reactive<Record<string, ApiError>>({});
const confirming = ref<{ id: string; action: Action } | null>(null);

const newEmail = ref('');
const newRole = ref<StaffRole>('supervisor');
const emailError = ref<string | null>(null);
const addError = ref<ApiError | null>(null);
const adding = ref(false);

const sorted = computed(() =>
  [...staff.value].sort(
    (a, b) => Number(b.isActive) - Number(a.isActive) || a.email.localeCompare(b.email),
  ),
);

const isMe = (m: StaffMember) => m.email.toLowerCase() === auth.user?.email.toLowerCase();
const otherRole = (role: StaffRole): StaffRole =>
  role === 'super_admin' ? 'supervisor' : 'super_admin';

async function load(): Promise<void> {
  status.value = 'loading';
  loadError.value = null;
  try {
    staff.value = await api.get<StaffMember[]>('/admin/staff');
    status.value = 'ready';
  } catch (err) {
    loadError.value = asApiError(err);
    status.value = 'error';
  }
}

async function addStaff(): Promise<void> {
  const email = newEmail.value.trim();
  addError.value = null;
  emailError.value = !email
    ? 'Enter their Google email address.'
    : EMAIL.test(email)
      ? null
      : 'Enter a full email address, for example chef@gmail.com.';
  if (emailError.value) return;

  adding.value = true;
  try {
    const created = await api.post<StaffMember>('/admin/staff', { email, role: newRole.value });
    staff.value = [...staff.value, created];
    newEmail.value = '';
    toast.show(
      `${created.email} added as ${roleLabel(created.role)}. They sign in with that Google account.`,
    );
  } catch (err) {
    const apiError = asApiError(err);
    if (apiError.code === 'STAFF_EXISTS') emailError.value = apiError.message;
    else if (apiError.fieldErrors?.email?.[0]) emailError.value = apiError.fieldErrors.email[0];
    else addError.value = apiError;
  } finally {
    adding.value = false;
  }
}

async function change(
  m: StaffMember,
  patch: { role?: StaffRole; isActive?: boolean },
): Promise<void> {
  delete errors[m.id];
  busy[m.id] = true;
  try {
    const updated = await api.patch<StaffMember>(`/admin/staff/${m.id}`, patch);
    staff.value = staff.value.map((s) => (s.id === m.id ? updated : s));
    confirming.value = null;
    toast.show(
      patch.isActive === false
        ? `${m.email} no longer has staff access.`
        : patch.isActive === true
          ? `${m.email} has staff access again.`
          : `${m.email} is now a ${roleLabel(updated.role)}.`,
    );
  } catch (err) {
    errors[m.id] = asApiError(err);
  } finally {
    busy[m.id] = false;
  }
}

function confirmText(m: StaffMember, action: Action): string {
  if (action === 'deactivate') {
    return `Remove staff access for ${m.email}? They can still sign in and order as a customer.`;
  }
  return otherRole(m.role) === 'super_admin'
    ? `Make ${m.email} a super admin? They will be able to change prices, photos and staff.`
    : `Make ${m.email} a kitchen supervisor? They will only be able to switch dishes and meats on or off and set meat prices.`;
}

function confirmed(m: StaffMember, action: Action): void {
  void change(m, action === 'deactivate' ? { isActive: false } : { role: otherRole(m.role) });
}

onMounted(load);
</script>

<template>
  <section>
    <p class="eyebrow eyebrow--crimson">Staff area</p>
    <h1>Staff</h1>
    <p class="lead">
      Add people by the Google email they sign in with. Changes apply the next time their screen
      loads.
    </p>

    <form class="card add" data-test="add-staff" novalidate @submit.prevent="addStaff">
      <h2>Add a staff member</h2>
      <div class="fields">
        <label class="field">
          <span>Google email</span>
          <input
            v-model="newEmail"
            type="email"
            autocomplete="off"
            :aria-invalid="emailError ? 'true' : undefined"
            :aria-describedby="emailError ? 'staff-email-error' : undefined"
          />
        </label>
        <label class="field">
          <span>Role</span>
          <select v-model="newRole">
            <option value="supervisor">Kitchen supervisor</option>
            <option value="super_admin">Super admin</option>
          </select>
        </label>
        <button type="submit" class="btn-primary btn-sm" :disabled="adding">Add</button>
      </div>
      <p v-if="emailError" id="staff-email-error" class="error" data-test="email-error">
        {{ emailError }}
      </p>
      <div v-if="addError" data-test="add-error"><ActionError :error="addError" /></div>
    </form>

    <p v-if="status === 'loading'" class="state" aria-busy="true">Loading the staff list…</p>

    <InlineError
      v-else-if="status === 'error'"
      title="We couldn’t load the staff list."
      :error="loadError"
      @retry="load"
    />

    <p v-else-if="!staff.length" class="state">No staff yet.</p>

    <ul v-else class="rows">
      <li v-for="m in sorted" :key="m.id" data-test="staff" :class="{ inactive: !m.isActive }">
        <div class="line">
          <div class="who">
            <span class="email">{{ m.email }}</span>
            <span class="meta">
              <template v-if="m.isActive">
                {{ roleLabel(m.role) }} · Added {{ formatWatDate(m.createdAt) }}
              </template>
              <template v-else>
                {{ roleLabel(m.role) }} · No staff access since
                {{ formatWatDate(m.deactivatedAt ?? m.createdAt) }}
              </template>
              <strong v-if="isMe(m)" class="you"> · You</strong>
            </span>
          </div>
          <div v-if="!isMe(m)" class="actions">
            <template v-if="m.isActive">
              <button
                type="button"
                class="link"
                data-test="change-role"
                :disabled="busy[m.id]"
                @click="confirming = { id: m.id, action: 'role' }"
              >
                {{
                  otherRole(m.role) === 'super_admin'
                    ? 'Make super admin'
                    : 'Make kitchen supervisor'
                }}
              </button>
              <button
                type="button"
                class="link"
                data-test="deactivate"
                :disabled="busy[m.id]"
                @click="confirming = { id: m.id, action: 'deactivate' }"
              >
                Remove access
              </button>
            </template>
            <button
              v-else
              type="button"
              class="btn-primary btn-sm"
              data-test="reactivate"
              :disabled="busy[m.id]"
              @click="change(m, { isActive: true })"
            >
              Give access again
            </button>
          </div>
        </div>
        <div v-if="confirming?.id === m.id" class="confirm" data-test="confirm">
          <p>{{ confirmText(m, confirming.action) }}</p>
          <div class="actions">
            <button
              type="button"
              class="btn-primary btn-sm"
              data-test="confirm-yes"
              :disabled="busy[m.id]"
              @click="confirmed(m, confirming.action)"
            >
              {{ confirming.action === 'deactivate' ? 'Remove access' : 'Change role' }}
            </button>
            <button type="button" class="link" data-test="confirm-no" @click="confirming = null">
              Cancel
            </button>
          </div>
        </div>
        <ActionError v-if="errors[m.id]" :error="errors[m.id]!" />
      </li>
    </ul>
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
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}
.add h2 {
  margin: 0 0 0.75rem;
  font-family: var(--font-body);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-gold);
}
.fields {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
}
.field {
  display: grid;
  gap: 0.25rem;
  font-size: 0.8125rem;
  font-weight: 600;
}
.field:first-child {
  flex: 1 1 14rem;
}
input,
select {
  min-height: 2.25rem;
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
  font-weight: 400;
}
input[aria-invalid='true'] {
  border-color: var(--color-crimson);
}
.error {
  margin: 0.5rem 0 0;
  color: var(--color-crimson);
  font-size: 0.875rem;
  font-weight: 600;
}
.rows {
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--color-white);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
}
.rows li {
  padding: 0.75rem 1rem;
}
.rows li + li {
  border-top: 1px solid var(--color-border);
}
.inactive .who {
  opacity: 0.7;
}
.line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
}
.who {
  display: grid;
  min-width: 0;
}
.email {
  font-weight: 600;
  overflow-wrap: anywhere;
}
.meta {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}
.you {
  color: var(--color-charcoal);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
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
.confirm {
  margin-top: 0.75rem;
  padding: 0.75rem;
  border-radius: 0.75rem;
  background: var(--color-surface-soft);
}
.confirm p {
  margin: 0 0 0.5rem;
  font-size: 0.875rem;
}
</style>
