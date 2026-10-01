# AGENT.md

Instructions for any AI coding agent (or developer) working in this repository. Read this fully before writing code. If a task conflicts with this file, stop and ask.

---

## 1. Project overview

**Mustard Seed Restaurant & Bar** is a web platform for a restaurant serving Efik and Ibibio (Cross River and Akwa Ibom) cuisine.

- Headquarters: Calabar, Cross River State
- Branch: 97 Tunde Ukpehe (Mitama), Uyo, Akwa Ibom State
- Domain: `mustardseed.ng`
- Open daily 8am – 11pm. **Online orders close at 10:30pm.**

The first deliverable is the **customer landing page and ordering flow**, matching the approved design (`Mustard_Seed_Restaurant_and_Bar___Landing_Page.pdf`).

### Core customer flow

1. Sign in with Google (one tap, no passwords).
2. Pick food and drinks; choose delivery or pickup.
3. Pay online. The order reaches the kitchen only after payment clears. Customer can track the order live.

### Business rules (do not change without approval)

- Online payment only. Never send an unpaid order to the kitchen.
- Delivery is a flat **₦1,500 anywhere in Calabar**. Pickup is free.
- Online ordering is live for **Calabar only**. Uyo shows "Online ordering coming soon".
- Alcohol is **not** sold online. Menu covers food, soups, swallow and sides, continental dishes, and non-alcoholic drinks (including fresh juices).
- Menu categories: Calabar classics, Swallow & sides, Continental, Drinks.
- Items can be marked "House signature" and can be switched available/unavailable by staff.
- Prices, photos, the Calabar address and the phone/WhatsApp number are **placeholders** (`[PRICE]`, `[CALABAR ADDRESS]`, `[PHONE / WHATSAPP]`) until real data is supplied. Never invent real values. Render placeholders from data/config so they can be replaced without code changes.

---

## 2. Repository structure

Two separate folders, two separate apps. They communicate only through the backend REST API.

```
/
├── AGENT.md
├── CLAUDE.md    # one line: @AGENT.md
├── docs/        # design sources of truth (landing-page.pdf, email-order-confirmation.pdf)
├── backend/     # NestJS (TypeScript)
└── frontend/    # Vue 3 (TypeScript)
```

- `docs/landing-page.pdf` and `docs/email-order-confirmation.pdf` are the approved designs. Read the relevant one before building any page or email, and match it.

- Do not import code across `frontend/` and `backend/`. If types must be shared, duplicate them or publish a small contract (e.g. OpenAPI spec) — do not couple the folders.
- Each folder has its own `package.json`, lint config, test config and `.env.example`.
- Never commit `.env` files or secrets. Keep `.env.example` up to date.

---

## 3. Tech stack

| Layer | Choice |
|---|---|
| Runtime | **Node.js 24 (Active LTS)** for both apps, pinned in `.nvmrc` and `engines`. Package manager: **pnpm**. |
| Backend | NestJS, TypeScript (strict mode) |
| Frontend | Vue 3 (Composition API, `<script setup lang="ts">`), Vite, Vue Router, Pinia |
| Auth | Google Sign-In (OAuth) on the frontend, token verified on the backend, backend issues its own session/JWT |
| Database | Supabase (hosted PostgreSQL). All application data is stored here. |
| File/image storage | Supabase Storage (same Supabase project). All images are stored here; no other storage platform is used. |
| Payments | Paystack, behind a `PaymentGateway` interface. **Until the real account is ready, the app talks to our own built-in Paystack Simulator** that imitates Paystack's API (see section 3.1). Verify via signed webhook plus server-side verification; never trust the client. |
| Email | Mailgun (transactional order confirmation emails), behind a mail-provider interface |
| Validation | `class-validator` / `class-transformer` on the backend; schema validation on frontend forms |
| API docs | OpenAPI/Swagger generated from the NestJS controllers |

If you need to add a major dependency not listed here, ask first.

### 3.1 Integrations

#### Supabase (database)

- Supabase Postgres is the only datastore. Use migrations (SQL files committed to the repo) for every schema change; never edit the schema by hand in the dashboard.
- The backend is the only thing that talks to the database. The frontend must **never** receive the Supabase service-role key. Keep it in backend env only.
- Enable Row Level Security on every table. Even though the backend uses the service role, RLS is the safety net if a key or client is ever misused.
- Use separate Supabase projects (or schemas) for development, test and production. Tests never touch production data.
- Money columns are integers in kobo. Timestamps are `timestamptz` stored in UTC.
- Include a `table_id` nullable column on orders now, so dine-in/QR ordering can be added later without a migration.

#### Images (Supabase Storage)

All images (menu items, juices, hero, story and team photos) live in Supabase Storage in the same project as the database. Do not add another storage or image-hosting service.

- Use a public read bucket for site images (e.g. `site-images`). Uploads, replacements and deletes happen **only through the backend**, using admin/supervisor-authorised endpoints. The frontend never uploads straight to Supabase and never holds the service-role key.
- Store only the object **path/key** in the database (e.g. `menu_items.image_path`), never a hard-coded full URL. Build the public URL from config so the bucket or domain can change later.
- Validate every upload on the backend: allowed types (JPEG, PNG, WebP), a maximum file size (default 5 MB, configurable), and a file-signature check, not just the extension. Reject anything else with a clear 4xx error.
- Process every upload with `sharp` before storing: auto-rotate, strip metadata, convert to **WebP**, and produce a thumbnail and a full-size version (e.g. 400px and 1200px wide). Store only the processed files.
- **Supabase's free plan is tight (1 GB storage, 5 GB egress shared across the whole project, and egress overage can restrict the entire project, including the database).** Treat image weight as a hard requirement: keep thumbnails small (target under 60 KB), use the thumbnail in menu lists and the full size only on detail views, lazy-load images below the fold, and set long `Cache-Control` headers on uploads (versioned file names so updates still show). Never serve original, unprocessed uploads.
- Log storage usage and surface it to admins so the limit is never a surprise, and flag it to the owner when usage passes about 70% of the free allowance.
- Items without an image show the "Photo coming" placeholder from the design. Deleting or replacing an item's image also removes the old file from the bucket.
- Access the bucket through an `ImageStorage` interface (Supabase implementation plus an in-memory fake for tests) so tests never touch real storage.

#### Payments: Paystack + built-in Paystack Simulator

There is no official dummy Paystack API, and the real Paystack account is not set up yet. So we build our own **Paystack Simulator**: a small module inside the backend that imitates Paystack's real REST API, hosted checkout page and webhooks. The app talks to it exactly as it will talk to real Paystack, so going live is a configuration change, not a code change.

**Core idea: one real client, two base URLs**

- There is a single `PaystackGateway` class (behind a `PaymentGateway` interface) that calls Paystack's HTTP API using `PAYSTACK_BASE_URL` and `PAYSTACK_SECRET_KEY`.
- Development and tests: `PAYSTACK_BASE_URL` points at the simulator (e.g. `http://localhost:3000/simulator/paystack`).
- Production: `PAYSTACK_BASE_URL=https://api.paystack.co` with the real secret key. Nothing else changes.
- Do not write a separate "dummy gateway" class. The real client code must run against the simulator so it is genuinely tested.
- For fast unit tests only, an in-memory fake of `PaymentGateway` is allowed. BDD/e2e tests must go through the simulator over HTTP.

**Where it lives**

- `backend/src/simulator/paystack/` as its own Nest module. It is registered **only** when `PAYSTACK_SIMULATOR_ENABLED=true`.
- Simulator state is stored in a dev/test-only table (`simulator_paystack_transactions`) created by a dev-only migration that is never applied to production. In-memory storage is fine for unit tests.

**Endpoints to imitate (same paths, headers, JSON shapes, amounts in kobo)**

| Method and path | Behaviour |
|---|---|
| `POST /transaction/initialize` | Requires `Authorization: Bearer <secret key>` (401 if missing or wrong). Accepts `email`, `amount` (kobo), optional `reference`, `callback_url`, `metadata`. Returns `{ status: true, message, data: { authorization_url, access_code, reference } }`. Rejects invalid email, non-integer or zero amount, and duplicate reference. |
| `GET /transaction/verify/:reference` | Requires the bearer key. Returns `{ status: true, message, data: { id, reference, amount, currency: "NGN", status, channel, paid_at, customer: { email }, metadata } }` where `data.status` is `success`, `failed`, `abandoned` or `ongoing`. Unknown reference returns 404 with `status: false`. |
| `GET /checkout/:access_code` | Hosted **TEST PAYMENT** page (see below). |

**Hosted checkout page**

- Clearly branded "TEST PAYMENT: no real money is charged", using the project's colour tokens and fonts.
- Shows the order reference and amount in naira, with buttons to simulate: **Pay successfully**, **Card declined** (failed), **Cancel** (abandoned), and **Leave pending** (ongoing).
- After the choice it redirects the customer to the `callback_url` with `?reference=...&trxref=...`, exactly like Paystack.
- On success it also fires the webhook (below).

**Webhooks**

- On a successful payment the simulator sends `POST` to `PAYSTACK_WEBHOOK_URL` (the backend's `/api/v1/payments/webhook`) with a `charge.success` event body shaped like Paystack's (`event`, `data.reference`, `data.amount`, `data.status`, `data.customer.email`, `data.metadata`).
- The header `x-paystack-signature` is the **HMAC-SHA512 of the raw request body** using the secret key, same as real Paystack. The backend verifies it against the raw body (enable raw-body access in Nest) with a timing-safe comparison.
- Failed and abandoned payments do **not** produce a success webhook. The backend learns about them through verification and an expiry job that closes stale `awaiting_payment` orders. Model this the same way.

**Control endpoints (simulator only, never in production)**

Under `/simulator/paystack/_control/`, used by BDD tests and manual testing:

- Force the outcome for a reference (`success`, `failed`, `abandoned`, `ongoing`) without using the checkout page.
- **Replay the webhook** for a reference (once or several times) to test idempotency.
- Send a webhook with a **bad or missing signature**, or with a **wrong amount**, to test rejection.
- **Fail the next call(s)** with a chosen status (500/502/503) or a delay/timeout, to test upstream-failure handling.
- Reset all simulator state between scenarios.

**Environments and safety rules**

The app has an `APP_ENV` variable: `local`, `test`, `staging` or `production`. This is separate from `NODE_ENV`, which only controls build and runtime optimisation. A staging server on a live host normally runs with `NODE_ENV=production` for speed, so the simulator rules must key off `APP_ENV`, never `NODE_ENV`.

- The simulator is allowed in `local`, `test` and `staging`. It **never** runs when `APP_ENV=production`.
- The app **fails to start** if `APP_ENV=production` and either `PAYSTACK_SIMULATOR_ENABLED=true` or `PAYSTACK_BASE_URL` points at the simulator. It also fails to start if `APP_ENV` is missing or not one of the four values.
- The simulator can be enabled on a live staging server (public URL, HTTPS) so the whole flow can be tested end to end. The build itself is not affected by this flag; it is only checked at startup.
- On a live staging server the simulator's `/_control/` endpoints are protected by a secret header (`SIMULATOR_CONTROL_KEY`), because the server is reachable from the internet. Without the right key they return 404. The checkout page itself stays open so testers can use it.
- The simulator's routes are not mounted at all unless explicitly enabled.
- The simulator uses its own test secret key value; never reuse a real Paystack key.
- Staging uses its **own Supabase project** (separate database and storage) and its own Mailgun sending setup (sandbox domain or an allow-list of tester addresses), so no test data mixes with real data and no test email goes to real customers.
- When the simulator is on, the backend exposes `GET /health` (unversioned, for uptime checks) and `GET /api/v1/config/public` with a `paymentMode: "simulated"` field. The frontend reads it and shows a persistent **"TEST MODE: payments are simulated"** banner on every page. The banner is absent when `paymentMode` is `"live"`.
- Staging must not be advertised to real customers. Simulated payments mean no real money is collected. Real customers can only be served after the go-live steps below.

**Business rules that apply to the real and simulated flow alike**

- The order only moves to `paid` after the signature-verified webhook **and/or** a server-side verify call whose amount and currency match the order total. The frontend redirect alone is never proof of payment.
- Compare the amount in kobo against the server-computed order total; reject mismatches.
- Processing is idempotent per payment reference: duplicate webhooks never create a second payment record, status change or email.

**Going live later**

1. Create the Paystack account and use its **test-mode** keys (`sk_test_...`) with `PAYSTACK_BASE_URL=https://api.paystack.co` and `PAYSTACK_SIMULATOR_ENABLED=false` (still on staging).
2. Register the production webhook URL in the Paystack dashboard.
3. Re-run the full BDD suite plus a short manual checklist (success, declined card, abandoned checkout, duplicate webhook) against Paystack test mode.
4. Only then deploy to production with `APP_ENV=production` and live keys.
5. Keep the simulator for local development and CI.

#### Mailgun (confirmation email)

- When an order's payment clears (status becomes `paid`), the backend sends the customer an **order confirmation email** via Mailgun. Send it once per order, even if the webhook is delivered twice.
- Define a `MailProvider` interface with a `MailgunProvider` implementation and an in-memory/fake provider for tests. Tests must never send real email.
- The email contains: order reference, items and quantities, subtotal, delivery fee, total in naira, delivery or pickup details, the restaurant name, and a link to the live order status page. Use the same brand colours and fonts-with-fallbacks as the site (inline CSS, email-safe), plus a plain-text version.
- Email sending must not block or break order processing. If Mailgun fails, the order stays `paid`, the failure is logged and recorded, and the send is retried (bounded retries with backoff). The customer still sees the confirmation screen and status page.
- Record every email attempt (order ID, recipient, provider message ID, `SENT` or `FAILED`, error reason) in the transactions/audit data so failed emails can be found and resent.
- Mailgun API key, domain and sender address come from env vars. Validate them at startup.

#### Order confirmation email template

The approved design is `docs/email-order-confirmation.pdf`. Build the email to match it. Placeholders in square brackets in the design (`[FIRST NAME]`, `[PRICE]`, `[ETA, e.g. 7:45pm]`, `[PHONE / WHATSAPP]`, and so on) are replaced with real data from the order. Business contact details that are not yet supplied stay as configurable placeholders.

**Layout, top to bottom**

1. Hidden preview text: `Payment received — the kitchen has your order #MS-0000.`
2. Charcoal header with the logo and "Mustard Seed / RESTAURANT & BAR", with the crimson-and-gold zigzag trim.
3. Check-mark icon (gold check on a charcoal circle), crimson eyebrow **PAYMENT RECEIVED**, then the Cormorant Garamond heading **"Amedi, {firstName}! Your order is in the kitchen."** and the short line about food being handed to the rider.
4. Two-cell box: **Order number** (white cell) and **Estimated arrival** (charcoal cell with gold label).
5. Full-width crimson button **Track your order live**.
6. Four-step progress bar: Confirmed (filled crimson), Preparing, Ready, Delivered.
7. **Your order**: one row per line item with quantity, name, a small note line (chosen variant such as "with Pounded Yam", or "House signature", or a short description) and the line price. Then Subtotal, Delivery (anywhere in Calabar) ₦1,500, a rule, and **Total paid**. Below it: `Paid with Paystack · {channel} · {date, time}`.
8. Two columns: **DELIVERING TO** (name, street address, "Calabar, Cross River State", phone) and **NEED HELP?** (call or WhatsApp number, and "quote your order number").
9. Charcoal footer: italic gold **"Sosongo — thank you for eating with us."**, the restaurant line (Calabar · Uyo · Since 2012, opening hours, mustardseed.ng), the reason-for-email line, and the zigzag trim again.

**Variants the design does not show (build these too)**

- **Pickup orders:** no delivery row. The address block becomes **PICK UP AT** with the branch address. "Estimated arrival" becomes "Ready for pickup by". The last progress step reads "Collected" and the intro line no longer mentions a rider.
- **Variants and notes:** an item with no variant or note simply omits that line.
- Long orders: any number of items must render cleanly without breaking the layout.

**Data the email needs (so checkout and orders must capture it)**

- Customer first name (from the Google profile), delivery full name, phone number and street address (city is fixed to Calabar). Pickup needs name and phone.
- Order number in the form `#MS-0000`: a human-friendly number from a database sequence (zero-padded to four digits, extending naturally past 9999), separate from the internal ID. It must never be reused.
- Payment channel (card or bank transfer) and paid-at time from the verified Paystack data, shown in **WAT**.
- Estimated arrival, calculated by the backend when payment clears from configurable values (item prep times, kitchen load and delivery time). Until the owner confirms the exact formula, use a documented configurable default. Never hard-code a promise in the template.
- All amounts are formatted from kobo as naira with thousands separators (for example `₦12,500`). The email total must equal the stored order total.

**Tracking link**

- "Track your order live" links to the status page with an **unguessable, high-entropy token**, never the sequential order number or ID. The status page must not reveal the delivery address or phone to anyone without that token or a matching signed-in session.

**Building it (email-safe)**

- Build with **MJML** (or hand-written table layout), compiled to HTML at build time. Maximum width 600px, single column that stacks cleanly on mobile, all CSS inlined.
- Fonts: declare the brand fonts with fallbacks (Cormorant Garamond → Georgia, serif; Plus Jakarta Sans → Arial, Helvetica, sans-serif). The email must look correct when web fonts do not load.
- Images (logo, zigzag strips, check icon) are PNG, with 2x versions, absolute HTTPS URLs, explicit width/height, and meaningful `alt` text. Host them as static files on the frontend site (for example `https://mustardseed.ng/email/...`), **not** in Supabase Storage, so email opens don't use the Supabase egress allowance. The email must still read clearly and keep its colours with images blocked (use background colours as fallbacks).
- Always send a **plain-text version** with the same information.
- Keep the HTML under about 100 KB (Gmail clips larger messages).
- Escape every user-supplied value (names, addresses, notes) before it goes into HTML to prevent injection.
- Subject line: `Payment received — your Mustard Seed order #MS-0000`. From name: "Mustard Seed Restaurant & Bar". Transactional only; no marketing content.
- Sending domain must be verified in Mailgun with SPF and DKIM, and a DMARC record set up, so the email reaches inboxes rather than spam.
- Check the rendered email in Gmail (web and mobile), Apple Mail, and Outlook, plus dark mode, before go-live.
- Template code lives in `backend/src/mail/templates/order-confirmation/`. The brand colours come from the email theme file, never inline hex values scattered through the template.

### 3.2 Runtime, tooling and CI

- **Node.js 24 (Active LTS)** is the required runtime for `backend/` and `frontend/`, in development, CI and hosting. Do not use odd-numbered or "Current" releases.
- Pin it in three places: `.nvmrc` (`24`), the `engines` field in each `package.json` (`">=24 <25"`), and the CI/Docker base image (`node:24`-based).
- Node.js 26 becomes LTS in late October 2026. Do not move to it until it is LTS **and** NestJS, Vite and every dependency support it. The upgrade is a separate, deliberate task with the full test suite green, not part of feature work.
- **pnpm** is the only package manager. Commit `pnpm-lock.yaml`, install with `--frozen-lockfile` in CI, and never mix in npm or yarn lockfiles.
- **CI (GitHub Actions)** runs on every push and pull request, separately for backend and frontend: install, lint, type-check, unit tests, BDD tests, and build. A failing step blocks merging. The Paystack Simulator and fake mail/image providers are used in CI; CI never calls real external services.
- Run `pnpm audit` in CI and keep dependencies patched. Never ignore a high or critical advisory without a written reason.

### 3.3 API versioning, CORS and security headers

**API versioning**

- Every business endpoint lives under **`/api/v1`** (global prefix plus URI versioning). Example: `POST /api/v1/orders`.
- Unversioned exceptions only: `GET /health` (uptime checks) and the simulator's routes under `/simulator/paystack` (non-production only).
- A breaking change to a response or behaviour means a new version (`/api/v2`), with `v1` kept working during the transition. Additive changes (new optional fields) stay in `v1`.
- The frontend reads the API base URL (including `/api/v1`) from its env file and never hard-codes it.

**CORS**

- Allowed origins come from the `CORS_ALLOWED_ORIGINS` env var (comma-separated) and are matched **exactly**. No wildcards, no regex patterns, never `*`, and never reflect the incoming `Origin` header blindly.
- Production value: **`https://mustardseed.ng`** only. If the site is also reachable at `www.mustardseed.ng`, redirect it to the apex domain at the host/DNS level rather than adding it to CORS.
- Local development may add `http://localhost:<port>`; staging may add the staging site's own origin. These values live in each environment's env file, never in code.
- Allow only the methods and headers the API actually uses. Requests from other origins are rejected and logged at `warn`.
- The payment webhook is server-to-server, not a browser call, so CORS does not protect it. It is protected by its signature check instead.

**Security headers (industry standard)**

- **Backend:** use `helmet` and disable `X-Powered-By`. The API returns JSON only, so use a locked-down policy (`Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`), plus `Strict-Transport-Security` (HSTS, with `includeSubDomains`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Resource-Policy`, and `Cache-Control: no-store` on authenticated and order responses.
- **Frontend (set at the hosting layer):** `Content-Security-Policy` allowing only what the site needs (own origin; Google Sign-In; Google Fonts; the Supabase Storage domain for images; the API origin), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `frame-ancestors 'none'` (and `X-Frame-Options: DENY`), `Referrer-Policy`, and a restrictive `Permissions-Policy`. Because Google Sign-In uses a popup, use `Cross-Origin-Opener-Policy: same-origin-allow-popups`. No inline scripts; do not use `unsafe-eval`.
- **HTTPS only** everywhere except local development. Redirect HTTP to HTTPS.
- **Rate limiting** with `@nestjs/throttler`: a sensible global default, with stricter limits on sign-in, order creation, checkout/payment initialisation and the image-upload endpoints. Return `429` with a `Retry-After` header. The frontend must handle `429` (section 7).
- **Session handling:** deliver the session token as an `HttpOnly`, `Secure`, `SameSite=Lax` cookie, never in `localStorage` or `sessionStorage`. For cookie-authenticated state-changing requests, also verify the `Origin` header against the allow-list as CSRF defence.
- Validate and sanitise all input (DTOs with `whitelist` and `forbidNonWhitelisted`), use parameterised queries only, and never return stack traces or internal errors.
- Verify security headers and CORS in tests (section 5).

### 3.4 Roles and staff provisioning

- Roles: `customer`, `supervisor` (kitchen supervisor: kitchen board, availability, menu and prices) and `super_admin` (everything, plus reports and staff management).
- **Customers** are created automatically on first Google sign-in with the `customer` role.
- **Staff are provisioned on the backend only.** There is no staff self-signup, no "become staff" option in the UI, and the client can never choose or change a role.
  - Staff accounts are created by a protected backend mechanism: a seed/CLI script for the first `super_admin` (email from `SEED_SUPER_ADMIN_EMAIL`), and a `super_admin`-only endpoint (`/api/v1/admin/staff`) to add, change the role of, deactivate or reactivate other staff.
  - Staff sign in with Google too, but only if their email matches a provisioned, active staff record. An unknown or deactivated email gets a customer session at most and is refused every staff route.
  - Matching is on the **verified** Google email.
- Enforce roles on the backend with guards on every route (deny by default). Hiding a button in the UI is never a substitute.
- Staff creation, role changes, deactivation and every sign-in refusal are logged (section 6).

---

## 4. Design system (strict)

The design in the attached PDF is the source of truth. **Follow the theme colours exactly. Do not introduce new colours, tints that read as new colours, or off-palette greys.**

### Colour tokens

| Token | Hex | Use |
|---|---|---|
| `--color-crimson` | `#9F2D2D` | Primary actions (Order now, Add, Your order), the red juice section, accent text |
| `--color-gold` | `#C5A059` | Eyebrow labels, italic highlight text on dark, avatar, zigzag trim, "House signature" badge text |
| `--color-charcoal` | `#1E221E` | Hero and footer backgrounds, primary text, dark cards (Hours), active category pill |
| `--color-cream` | `#F4F2EE` | Page background, light text on dark |
| `--color-white` | `#FFFFFF` | Cards |

Rules:

- Define these once as CSS custom properties (and in the Tailwind/theme config if used). Components must reference tokens, never raw hex values.
- Crimson is reserved for actions and key accents. Do not use it as a decorative background except where the design does (the fresh-juices band).
- Muted/secondary text and soft section backgrounds must be derived from the tokens above using opacity, not new hex values, and must still look like the PDF.
- **Exception for email:** many email clients (notably Outlook) ignore `rgba()` and opacity. In email templates only, use a **solid hex precomputed by blending a token over white or cream**, define each one once as a named constant in the email theme file (e.g. `crimsonTint`, `charcoalMuted`), and note which token it comes from. Do not invent hues.
- Meet WCAG AA contrast for text. If a token pairing fails AA, raise it with the owner rather than silently changing the colour.

### Typography

- Headings: **Cormorant Garamond** (serif), including italic gold/crimson emphasis phrases such as *served warm.* and *Akwa-Cross*.
- UI and body text: **Plus Jakarta Sans**.
- Eyebrow labels: small, uppercase, letter-spaced.

### Visual motifs (from the design)

- Zigzag/chevron border trim in crimson and gold (top of header, around the hero arch, above the juice section, above the footer).
- Arch-shaped image frames (hero and juice bottles).
- Rounded cards with soft borders; pill-shaped buttons and category chips.
- Photo placeholders: diagonal-stripe texture with a small "Photo coming" pill, until real photography exists.

### Layout

- **Mobile-first.** Design for ~375px first, then scale up. The PDF shows both desktop and mobile layouts; match both.
- Sections, in order: header, hero, 3-step "how it works", Today's menu (category tabs + item cards), Fresh juices, Our story, Visit us, footer.

---

## 5. Development methodology: TDD and BDD

**Every endpoint must be developed test-first and covered by both TDD and BDD tests, with both happy-path and sad-path scenarios.** No endpoint is "done" without them.

### Workflow for every endpoint

1. Write the BDD scenario (Gherkin) describing behaviour.
2. Write a failing test (red).
3. Write the minimum code to pass (green).
4. Refactor with tests still green.
5. Confirm logging (section 6) is in place and tested.

### Backend testing

- **TDD (unit/integration):** Jest. Test services, guards, pipes and controllers in isolation with mocks for external systems (Paystack, Google, database where appropriate).
- **BDD (behaviour/e2e):** Gherkin `.feature` files in `backend/test/features/`, executed with Cucumber (`@cucumber/cucumber`) against the real Nest app using `supertest`. Step definitions live in `backend/test/steps/`.
- Use an isolated Supabase test database (a separate project or a local Supabase instance via the Supabase CLI); reset state between scenarios.

### Required scenarios per endpoint

Each endpoint needs, at minimum:

**Happy path**
- Valid request, authenticated where required, returns the correct status code and body shape.
- Side effects occur (record created/updated, event emitted).

**Sad paths** (cover every one that applies)
- Missing or malformed body/params (400, with field-level errors)
- Unauthenticated (401) and unauthorised/forbidden (403)
- Resource not found (404)
- Conflict/duplicate (409)
- Business-rule violations, for example:
  - ordering outside operating hours or after the 10:30pm cut-off
  - ordering an item that is unavailable
  - delivery requested outside Calabar
  - empty cart
  - price or total mismatch between client and server
  - Paystack payment failed, abandoned, duplicated, or webhook signature invalid
- Upstream failure (Google/Paystack down or timing out) handled gracefully (502/503), with no partial state left behind
- Unexpected server error (500) returns a safe generic message and no stack trace

**Payment and email scenarios (required, using the Paystack Simulator and the fake mail provider)**
- Payment success: webhook verified, order becomes `paid`, kitchen is notified, confirmation email is sent once.
- Payment failed or abandoned: order does not reach the kitchen, no email is sent, failure is logged.
- Pending/timeout: order stays `awaiting_payment` until verification resolves it.
- Duplicate webhook: processed once only (no double payment record, no second email).
- Invalid or missing webhook signature: rejected (401/403) and logged.
- Amount mismatch between the webhook and the order total: rejected and logged.
- Mailgun failure: order stays `paid`, the failure is recorded, and a retry is scheduled.
- App refuses to start when `APP_ENV=production` and the simulator is enabled or `PAYSTACK_BASE_URL` points at it. It starts normally when `APP_ENV=staging` with `NODE_ENV=production` and the simulator enabled.
- Simulator `/_control/` endpoints return 404 without the correct `SIMULATOR_CONTROL_KEY`.
- Frontend shows the "TEST MODE" banner when `paymentMode` is `simulated` and hides it when `live`.
- Initialize rejected for invalid email, zero or non-integer amount, duplicate reference, or a missing/wrong bearer key.
- Paystack unreachable or slow (simulator set to fail or delay): checkout fails gracefully, order stays `awaiting_payment`, nothing reaches the kitchen, failure is logged.

**Image upload scenarios (required, using the fake `ImageStorage`)**
- Valid JPEG/PNG/WebP upload by an admin: stored as processed WebP thumbnail and full size, `image_path` saved, 201 returned.
- Unsupported file type, or a file whose contents don't match its extension: rejected (400/415).
- Oversized file: rejected (413).
- No file, or empty file: rejected (400).
- Unauthenticated or non-admin user: rejected (401/403).
- Unknown menu item: 404.
- Corrupt image that `sharp` cannot process: rejected (422), nothing stored.
- Storage failure from Supabase: handled gracefully (502/503), no orphaned database record or file left behind, failure logged.
- Replacing or deleting an image removes the old file.

**Security and access scenarios (required)**
- Requests to `/api/v1/...` succeed; a missing or wrong version prefix returns 404.
- CORS: a request from `https://mustardseed.ng` is allowed; any other origin (including a look-alike domain) is rejected and logged.
- Security headers are present on API responses (HSTS, `nosniff`, no `X-Powered-By`, locked-down CSP).
- Rate limiting: exceeding the limit on sign-in, order creation or payment initialisation returns 429 with `Retry-After`.
- Roles: a customer calling any staff endpoint gets 403; an unauthenticated caller gets 401; a supervisor cannot call super-admin endpoints.
- Staff provisioning: an unprovisioned email cannot reach staff routes; a deactivated staff member is refused; only a `super_admin` can create or change staff; a client-supplied `role` field is ignored or rejected.
- Staff provisioning events (create, role change, deactivate, refused sign-in) are logged.

**Email template scenarios (required)**
- A delivery order renders every field: first name, order number, ETA, each item with quantity, variant/note and price, subtotal, ₦1,500 delivery, total, payment channel, date and time in WAT, delivery name, address and phone.
- A pickup order renders the pickup variant (no delivery row, "PICK UP AT", "Collected").
- No unreplaced placeholders remain in the output (nothing like `[PRICE]`, `[FIRST NAME]` or `{{...}}`).
- Totals in the email equal the stored order total (formatted from kobo, with thousands separators).
- User-supplied values containing HTML or script are escaped.
- The tracking link is absolute HTTPS and contains an unguessable token, not the sequential order number.
- A plain-text version exists and contains the order number and total.
- The HTML is under the size limit, all images have `alt` text and absolute HTTPS URLs, and only email-theme colours are used.
- Very long item lists and long names do not break the layout (snapshot test).

Example feature skeleton:

```gherkin
Feature: Place an order

  Scenario: Customer places a valid delivery order in Calabar
    Given I am signed in as a customer
    And the item "Edikang Ikong" is available
    When I submit an order for 1 "Edikang Ikong" for delivery in Calabar
    Then the response status is 201
    And the order total includes the ₦1,500 delivery fee
    And the order status is "awaiting_payment"

  Scenario: Customer orders an unavailable item
    Given I am signed in as a customer
    And the item "Afang Soup" is unavailable
    When I submit an order for 1 "Afang Soup" for delivery in Calabar
    Then the response status is 422
    And the error message says the item is unavailable
    And the failure is logged
```

### Frontend testing

- **TDD (unit/component):** Vitest + Vue Test Utils for components, stores and composables.
- **BDD (user journeys):** Gherkin or Playwright-based scenarios for key flows (sign in, browse menu, add to order, checkout, payment success/failure), mocking the API for both happy and sad responses.
- Test every error state the UI can show (see section 7).

### Definition of done

- All new tests written first and passing.
- Happy and sad paths covered for every endpoint touched.
- Lint, type-check and the full test suite pass.
- No decrease in coverage; target at least 80% on new code.

---

## 6. Backend logging (success and failure transactions)

Every transaction must be logged, whether it succeeds or fails. Treat logs as an audit trail for orders and payments.

### Requirements

- Use a structured JSON logger (e.g. `nestjs-pino`) wired as the Nest application logger. No stray `console.log`.
- Generate a **correlation/request ID** per request, return it in a response header, and include it in every log line for that request.
- Log levels: `info` for successful transactions, `warn` for expected failures (validation, business-rule rejections, auth failures), `error` for unexpected failures and upstream errors.
- Add a global HTTP logging interceptor and a global exception filter so no request goes unlogged.

### What to log

For every order, payment and auth transaction record:

- timestamp, correlation ID, endpoint and method
- user ID (never raw tokens)
- outcome: `SUCCESS` or `FAILED`
- for failures: error code, reason, and the upstream status if applicable
- for orders and payments: order ID, amount, Paystack reference, status transition (e.g. `awaiting_payment` → `paid`)
- duration in ms

Also log, with the same fields and outcome:

- every payment gateway call and webhook received (reference, event type, signature valid or not, result)
- every Mailgun send attempt (order ID, recipient domain only, `SENT` or `FAILED`, provider message ID, error reason, retry count)
- every image upload, replace and delete (user ID, item ID, file size before and after processing, `SUCCESS` or `FAILED`, error reason)

### Must never be logged

Passwords, JWTs, Google tokens, Paystack secret keys, Supabase service-role keys, Mailgun API keys, webhook secrets, full card data, full customer email addresses (log the domain only), or full request bodies containing personal data. Configure logger redaction for these fields.

### Persistence

- Order and payment outcomes are also stored in a transactions/audit table so they can be queried, not only read from log files.
- Logging behaviour is part of the tests: assert that success and failure scenarios produce the expected log entries.

---

## 7. Frontend error handling

**The frontend must handle every error. No unhandled rejection, blank screen or raw error message may reach the user.**

- Wrap all API calls in a single API client (e.g. Axios instance or fetch wrapper) with a response interceptor that normalises errors into one shape.
- Handle and show a friendly message for each case:
  - Network offline / timeout
  - 400/422 validation errors (show field-level messages next to inputs)
  - 401 (session expired: redirect to sign-in and preserve the cart)
  - 403, 404, 409
  - 429 rate limiting
  - 5xx and unknown errors (generic message with a retry action)
  - Google sign-in cancelled or failed
  - Payment failed, cancelled or pending verification (clear next step; never leave the customer unsure whether they were charged)
  - Returning from the payment page with an unknown result: show "Confirming your payment..." and poll the order status; never assume success or failure from the redirect alone
  - Confirmation email delayed or failed: the order confirmation screen and status page remain the source of truth, with a note such as "We'll email your confirmation shortly"
  - An image fails to load: fall back to the "Photo coming" placeholder instead of a broken-image icon
  - Admin image upload errors (wrong type, too large, upload failed): show a clear message and keep the existing image
  - Closed hours / past the 10:30pm cut-off
  - Item became unavailable between adding and checkout
- Add a global Vue error handler (`app.config.errorHandler`) and a top-level error boundary so a component crash shows a recovery screen, not a blank page.
- Every async view has explicit loading, empty and error states.
- Error UI uses the design tokens; do not add new colours for errors. Use crimson with clear text and icons, not colour alone.
- Never display stack traces or backend internals. Show the correlation ID in a small "Reference" line on serious errors so support can trace it.

---

## 8. Code conventions

- TypeScript strict mode in both apps. No `any` without a justifying comment.
- ESLint + Prettier enforced in both folders; run before committing.
- Backend: modular Nest structure (`module / controller / service / dto / entity`), thin controllers, business logic in services, DTO validation on every input.
- Money is stored and calculated in **kobo (integers)** on the backend. Never use floats for money. Format as naira (₦) only at display time.
- All totals are computed on the server. Never trust prices or totals sent by the client.
- Timezone is **WAT (Africa/Lagos)** for operating hours and order cut-off logic.
- Commits: small, focused, conventional-commit style (`feat:`, `fix:`, `test:`, `chore:`).
- Accessibility: semantic HTML, keyboard navigation, visible focus, alt text on images.

---

## 9. Environment and secrets

- Config via environment variables; validate them at startup (fail fast if missing).
- Keep separate values for development, test and production.
- Paystack, Supabase service-role and Mailgun credentials live only in backend env files. Only the Google client ID (public) and the API base URL belong in frontend env files.
- Key backend variables (document all in `backend/.env.example`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `MAX_IMAGE_UPLOAD_MB`, `APP_ENV` (`local`, `test`, `staging`, `production`), `CORS_ALLOWED_ORIGINS`, `SEED_SUPER_ADMIN_EMAIL`, `PAYSTACK_BASE_URL`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_URL`, `PAYSTACK_SIMULATOR_ENABLED`, `SIMULATOR_CONTROL_KEY`, `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAIL_FROM`, `GOOGLE_CLIENT_ID`, `JWT_SECRET`.

---

## 10. Working agreements for agents

- Plan before coding: state which endpoint or component you are building and which scenarios you will test.
- Make the smallest change that satisfies the task. Do not refactor unrelated code.
- Never skip or delete a failing test to make a build pass. Fix the code or ask.
- Do not invent business data (prices, addresses, phone numbers, founder story). Leave placeholders and flag them.
- If the design PDF and this file ever disagree on colour, the design PDF wins; tell the owner so this file can be corrected.
- Always code against the `PaymentGateway`, `MailProvider` and `ImageStorage` interfaces, never directly against a vendor SDK in business logic, so any provider can be swapped without touching order logic. Paystack is reached only through `PaymentGateway`; the simulator is switched for the real API by changing `PAYSTACK_BASE_URL` and keys alone.
- Never send real email, call real payment APIs or write to real storage from tests.
- When unsure, ask. Ambiguity about payments, money or order state must always be resolved before coding.

---

## 11. Build order

Build in thin, fully tested slices (tests first, happy and sad paths, logging, error handling). Finish and merge each slice before starting the next.

1. Repo scaffolding: Node 24, pnpm, CI, logging, `/health`, `/api/v1` prefix, CORS, security headers, rate limiting
2. Menu API and the landing page (placeholders for prices, photos and address)
3. Google sign-in, customer sessions, roles and staff provisioning
4. Cart and order creation (server-computed totals, hours and cut-off rules, delivery or pickup)
5. Paystack Simulator, payment initialisation, signed webhook and verification
6. Mailgun confirmation email
7. Live order status page
8. Admin: menu availability, prices and image upload
9. Kitchen board for the supervisor
