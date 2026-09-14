# Phase 3: Storefront / Website Integration — Architecture & Design Document

**Status:** Design (no implementation)  
**Depends on:** Phase 1 Platform Kernel + Catalog, Phase 2 Commerce Core (domain + admin APIs)  
**Dependency note:** Phase 3 **design can proceed now**. Runtime implementation of Storefront API endpoints requires Phase 2B/2C commerce use cases and persistence. This document does **not** require production DB verification to be complete.

---

## 1. Goals

Phase 3 exposes HCP commerce to **guest-facing channels**: operator websites, landing pages, and embedded booking widgets — without giving public clients access to admin APIs or tenant-internal data.

| Goal | Success measure |
|------|-----------------|
| **Public booking path** | Guest completes Hold → Quote → Booking on a tenant's website |
| **Headless integration** | Custom site (Next.js, WordPress, static) consumes JSON Storefront API |
| **Drop-in widget** | Non-React site embeds booking in &lt;5 lines of HTML/JS |
| **React SDK** | React/Next sites use typed components with minimal boilerplate |
| **Tenant branding** | Widget matches operator colors, fonts, locale |
| **Secure public surface** | Publishable keys + domain allowlist; no secret keys in browser |
| **Commerce reuse** | Storefront routes call same use cases as admin API (different auth context) |
| **Observability hooks** | Widget/API emit structured events for future analytics |
| **CMS-ready** | Property slugs and content reference IDs stable for Phase 4 CMS |

---

## 2. Scope

### In scope (Phase 3)

1. **Storefront API** — public REST JSON under `/api/storefront/v1`
2. **Publishable keys** — tenant-scoped `pk_test_` / `pk_live_` credentials
3. **Domain allowlist** — per-key allowed origins for browser requests
4. **Public catalog read** — list/search properties and units (published only)
5. **Public availability & pricing** — check availability, get quote preview
6. **Public checkout** — create hold, quote, booking (guest contact fields)
7. **Booking Widget** — date picker, guest form, price summary, confirmation step
8. **React component package** — `@hcp/widget-react`
9. **JavaScript embed script** — `@hcp/widget-embed` (UMD/ESM loader)
10. **iframe fallback** — hosted widget page for strict CSP / no-script-control sites
11. **Theme configuration** — CSS variables + JSON theme tokens
12. **Widget event/callback system** — lifecycle hooks for host page
13. **Rate limiting** — per-key and per-IP on public endpoints
14. **Caching** — CDN-friendly reads (catalog, availability hints)
15. **i18n foundation** — locale param + message catalogs in widget/API errors
16. **API versioning** — `/v1` prefix with explicit deprecation policy
17. **SEO helpers** — structured data contracts, sitemap hooks (headless consumers)
18. **Future CMS hooks** — content slug resolution ports (stub responses OK)
19. **Future analytics hooks** — event schema + optional server-side forwarding port

### Assumed from prior phases

| Phase | Capability |
|-------|------------|
| Phase 1 | Tenant, Property, Unit catalog; multi-tenancy; RLS pattern |
| Phase 2A | Commerce domain: Hold, Quote, Booking, evaluators (pure TS) |
| Phase 2B/C | Commerce persistence, admin use cases, hold expiry job |
| Phase 2.5 (optional) | Live payment capture before `payment_required` tenants go live |

---

## 3. Out of scope

| Excluded | Target phase |
|----------|--------------|
| Full CMS / PropertyContent authoring | Phase 4 |
| Channel manager / OTA sync | Phase 5+ |
| Guest CRM, messaging, reviews | Phase 3+ / Phase 4 |
| Multi-property operator dashboards | Phase 3+ |
| Native mobile SDKs (iOS/Android) | Phase 3+ |
| White-label custom domains for API (CNAME) | Phase 3+ |
| Server-side rendered tenant sites hosted by HCP | Phase 4+ |
| AI search / natural language booking | Phase 6+ |
| Refunds, chargebacks UI | Phase 2.5+ |
| Revenue reporting | Phase 3+ |
| WordPress plugin (official) | Phase 3 stretch / Phase 3.1 |
| A/B testing / experimentation platform | Phase 5+ |

**Phase 3 stretch (optional):**

- Multi-unit cart (book multiple units one checkout)
- WordPress shortcode plugin
- Webhook subscriptions for booking events (tenant-configured URLs)

---

## 4. Storefront API contract

### Base URL

```
https://{hcp-host}/api/storefront/v1
```

Same monolith deploy as admin (`apps/web`) per ADR-001; extractable to edge service later.

### Authentication

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | `Bearer pk_live_xxx` or `Bearer pk_test_xxx` |
| `X-HCP-Locale` | No | BCP-47 locale (default from tenant settings) |
| `X-HCP-Session-Id` | No | Anonymous session UUID for hold attribution |
| `Origin` / `Referer` | Browser | Validated against key's domain allowlist |

**No cookies, no Auth.js session** on Storefront API. Guest identity is booking contact fields only.

### Tenant resolution

Publishable key → `tenantId` (and `environment: test|live`). Key record stores allowed domains, default locale, theme profile ID.

### Resource model (public DTOs)

Public responses **never** expose internal UUIDs unnecessarily where slugs suffice; however `unitId` is required for commerce operations.

| Resource | Public fields (summary) |
|----------|-------------------------|
| `Property` | `id`, `slug`, `name`, `type`, `timezone`, `location` (city/country only), `units[]` summary |
| `Unit` | `id`, `slug`, `name`, `maxGuests`, `bedrooms`, `bathrooms`, `status` (published only) |
| `AvailabilityResult` | `available`, `reasons[]`, `nights[]`, `minNights`, `maxNights` |
| `PricePreview` | `currency`, `lineItems[]`, `subtotal`, `total`, `checkIn`, `checkOut` |
| `Hold` | `id`, `expiresAt`, `checkIn`, `checkOut`, `unitId`, `guestCount` |
| `Quote` | `id`, `expiresAt`, `snapshot` (totals + line items), `holdId` |
| `Booking` | `id`, `status`, `confirmationCode`, `checkIn`, `checkOut`, `guest` (masked email optional) |

Internal fields excluded: `tenantId`, audit fields, payment provider IDs, admin notes.

### Endpoints

#### Catalog & search

| Method | Path | Description |
|--------|------|-------------|
| GET | `/properties` | List published properties (cursor pagination) |
| GET | `/properties/:slug` | Property detail + published units |
| GET | `/properties/:slug/units/:unitSlug` | Unit detail |

Query params for list: `?locale=el-GR&limit=20&cursor=`

#### Availability & search flow

| Method | Path | Description |
|--------|------|-------------|
| POST | `/units/:unitId/availability/check` | `{ checkIn, checkOut, guestCount }` |
| POST | `/units/:unitId/price/preview` | Same body; returns pricing without hold |
| POST | `/search/availability` | **Search flow:** `{ checkIn, checkOut, guestCount, propertySlug? }` → matching units with availability + from-price |

Search flow powers listing pages: "Show available villas Aug 1–7 for 4 guests."

#### Checkout (mirrors Phase 2 commerce)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/holds` | `{ unitId, checkIn, checkOut, guestCount, sessionId? }` |
| DELETE | `/holds/:holdId` | Release hold (guest abandons) |
| POST | `/quotes` | `{ holdId }` |
| GET | `/quotes/:quoteId` | Poll quote status / expiry |
| POST | `/bookings` | `{ quoteId, guest: { name, email, phone? } }` |
| GET | `/bookings/:confirmationCode` | Lookup by human-readable code (email link) |

#### Payment (when Phase 2.5 live)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/bookings/:id/payment-intent` | Returns client secret for widget |
| POST | `/bookings/:id/payment/confirm` | Completes payment-required booking |

#### Config (for widget bootstrap)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/config` | Theme tokens, locale list, currency, confirmation mode, feature flags |
| GET | `/config/widget` | Widget-specific: allowed embed modes, iframe URL template |

### Response envelope

```json
{
  "data": { },
  "meta": { "requestId": "...", "locale": "en-US" },
  "error": null
}
```

Errors:

```json
{
  "data": null,
  "error": {
    "code": "AVAILABILITY_UNAVAILABLE",
    "message": "Selected dates are not available",
    "details": [{ "code": "MIN_NIGHTS", "message": "..." }]
  },
  "meta": { "requestId": "..." }
}
```

### HTTP status mapping

| Status | When |
|--------|------|
| 200 | Success |
| 201 | Hold/booking created |
| 400 | Validation error |
| 401 | Missing/invalid publishable key |
| 403 | Domain not allowlisted |
| 404 | Property/unit not found or unpublished |
| 409 | Hold conflict, quote expired, double booking |
| 429 | Rate limited |
| 503 | Upstream commerce unavailable |

### Idempotency

| Endpoint | Header |
|----------|--------|
| POST `/holds`, POST `/bookings` | `Idempotency-Key: {uuid}` (required for bookings, recommended for holds) |

---

## 5. Widget architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Operator website (any stack)                     │
├─────────────────────────────────────────────────────────────────────┤
│  Option A: @hcp/widget-react    Option B: @hcp/widget-embed script │
│  Option C: iframe → hosted widget page on HCP origin                 │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTPS + publishable key
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Storefront API  /api/storefront/v1                    │
│  Auth: publishable key + domain allowlist + rate limits             │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ same use cases, StorefrontContext
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 2 application layer (CreateHold, CreateQuote, ConfirmBooking)│
└─────────────────────────────────────────────────────────────────────┘
```

### Widget modes

| Mode | Entry | Use case |
|------|-------|----------|
| **Inline** | JS embed or React | Property page sidebar |
| **Modal** | `data-hcp-mode="modal"` | CTA opens overlay |
| **Full page** | iframe or React route | Dedicated `/book` page |
| **Search + book** | React only (Phase 3) | Results list with dates |

### Widget state machine (UI)

```
idle → selecting_dates → checking_availability → pricing_shown
  → creating_hold → guest_details → confirming → success | error
```

Hold TTL countdown displayed; auto-refresh quote on expiry with user prompt.

### Package boundaries

| Package | Runtime | Depends on |
|---------|---------|------------|
| `@hcp/storefront-sdk` | Isomorphic TS | fetch, types only |
| `@hcp/widget-react` | Browser/React 18+ | storefront-sdk |
| `@hcp/widget-embed` | Browser | storefront-sdk, shadow DOM optional |

Domain package (`@hcp/domain`) is **not** imported by widget packages.

---

## 6. Headless API architecture

Headless consumers integrate via `@hcp/storefront-sdk` (typed fetch client) without widget UI.

### Client responsibilities

- Store publishable key server-side for SSR (server components) or build-time env
- Never expose `sk_` secret keys (none exist for storefront; admin uses Auth.js)
- Pass locale and session ID consistently
- Implement idempotency keys for booking POST

### SSR pattern (Next.js operator site)

```
Server Component → HCP SDK (pk_live) → GET /properties/:slug
Client Component → user selects dates → POST availability (browser or route handler)
Route Handler (optional) → proxy holds/bookings to hide key from browser
```

**Recommendation:** Support both **browser-direct** (simplest, key is publishable) and **BFF proxy** (operator prefers key only on server). Document trade-offs in SDK README.

### Anti-corruption

Storefront DTO mappers live in `apps/web/lib/storefront/mappers/` — separate from admin DTOs. Use cases return domain objects; mappers strip internal fields.

---

## 7. React SDK design

**Package:** `packages/widget-react`

### Exports

```typescript
// Provider
<HcpStorefrontProvider publishableKey locale theme unitId propertySlug>
  {children}
</HcpStorefrontProvider>

// Components
<BookingWidget />           // full flow
<DateRangePicker />
<AvailabilityChecker />
<PriceSummary />
<GuestDetailsForm />
<BookingConfirmation />

// Hooks
useAvailability(checkIn, checkOut, guestCount)
useHold()
useQuote()
useStorefrontConfig()
useWidgetEvents()
```

### Props (BookingWidget)

| Prop | Type | Description |
|------|------|-------------|
| `unitId` | string | Required unless `propertySlug` + auto-select single unit |
| `propertySlug` | string | Resolve default unit for single-villa |
| `mode` | `'inline' \| 'modal'` | Layout |
| `theme` | `Partial<ThemeConfig>` | Override tenant theme |
| `locale` | string | BCP-47 |
| `onEvent` | `(event: WidgetEvent) => void` | Lifecycle callback |

### Styling

- CSS modules or vanilla-extract scoped to widget root
- All colors via CSS custom properties (`--hcp-primary`, etc.)
- `className` / `style` passthrough on root container
- No global CSS leakage (Shadow DOM optional flag)

---

## 8. JavaScript embed design

**Package:** `packages/widget-embed`  
**Deliverable:** `https://cdn.hcp.example/embed/v1/hcp.js` (or same-origin `/embed/v1/hcp.js`)

### Snippet

```html
<div id="hcp-booking" data-hcp-key="pk_live_xxx" data-hcp-unit="unit_xxx"></div>
<script async src="https://cdn.hcp.example/embed/v1/hcp.js"></script>
```

### Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-hcp-key` | Yes | Publishable key |
| `data-hcp-unit` | Yes* | Unit ID |
| `data-hcp-property` | Yes* | Property slug (single-unit properties) |
| `data-hcp-locale` | No | Locale |
| `data-hcp-mode` | No | `inline` (default), `modal` |
| `data-hcp-theme` | No | URL-encoded JSON or theme preset name |

\* One of unit or property required.

### Loader behavior

1. Validate container present
2. Fetch `/config/widget` with key
3. Verify `window.location.origin` allowed (client-side pre-check; server enforces)
4. Inject widget bundle (lazy load React runtime + widget chunk)
5. Mount into container
6. Wire `window.HCP.on(event, handler)` global API

### Size budget

- Loader &lt; 5 KB gzipped
- Widget chunk lazy-loaded (&lt; 80 KB gzipped target)

---

## 9. iframe fallback design

For operators with strict CSP (`script-src 'self'`) or no JS access.

### Hosted URL

```
https://book.hcp.example/w/{widgetToken}?unit={unitId}&locale=el-GR&theme=default
```

`widgetToken` is a **public embed token** derived from publishable key + unit (not secret; obscures raw key in URL optional).

Alternative: pass `pk_` in query for MVP (document CSP requirement for iframe src).

### iframe integration

```html
<iframe
  src="https://book.hcp.example/w/...?unit=..."
  title="Book your stay"
  width="100%"
  height="680"
  frameborder="0"
  allow="payment"
></iframe>
```

### postMessage protocol

Parent ← iframe messages:

| type | Payload |
|------|---------|
| `hcp:ready` | `{ version }` |
| `hcp:resize` | `{ height }` |
| `hcp:availability_checked` | `{ available, checkIn, checkOut }` |
| `hcp:booking_completed` | `{ confirmationCode, bookingId }` |
| `hcp:error` | `{ code, message }` |

Parent → iframe:

| type | Payload |
|------|---------|
| `hcp:set_locale` | `{ locale }` |
| `hcp:set_theme` | `{ theme }` |

Origin validation on both sides against allowlist.

### Route

`apps/web/app/(storefront)/book/[...params]/page.tsx` — minimal chrome, widget only.

---

## 10. Theme configuration

### Theme sources (merge order)

1. Platform defaults
2. Tenant theme profile (admin UI, Phase 3)
3. Widget embed attributes / React props
4. iframe query params

### ThemeConfig schema

```typescript
interface ThemeConfig {
  preset?: 'light' | 'dark' | 'minimal';
  colors: {
    primary: string;
    primaryForeground: string;
    background: string;
    foreground: string;
    muted: string;
    border: string;
    success: string;
    error: string;
  };
  typography: {
    fontFamily?: string;
    fontFamilyHeading?: string;
    baseFontSize?: string;
  };
  radius: { sm: string; md: string; lg: string };
  spacing?: { unit: number };
  logoUrl?: string;
}
```

### CSS variables

Widget root sets `--hcp-color-primary`, etc. Operators can override in host page:

```css
#hcp-booking { --hcp-color-primary: #1a5f4a; }
```

### Persistence

Table `tenant_theme_profiles` (Phase 3B) — JSON column, referenced by publishable key config.

---

## 11. Event/callback system

### WidgetEvent union

```typescript
type WidgetEvent =
  | { type: 'ready'; version: string }
  | { type: 'dates_selected'; checkIn: string; checkOut: string; guestCount: number }
  | { type: 'availability_checked'; available: boolean; reasons?: string[] }
  | { type: 'price_updated'; total: string; currency: string }
  | { type: 'hold_created'; holdId: string; expiresAt: string }
  | { type: 'hold_expired' }
  | { type: 'guest_step'; }
  | { type: 'booking_submitted'; }
  | { type: 'booking_completed'; confirmationCode: string; bookingId: string }
  | { type: 'error'; code: string; message: string };
```

### Delivery mechanisms

| Integration | API |
|-------------|-----|
| React | `onEvent` prop |
| JS embed | `window.HCP.on(type, fn)` |
| iframe | `postMessage` to parent |

### Future analytics integration

- Same event schema consumed by `@hcp/analytics-adapter` (Phase 3+)
- Optional: `POST /analytics/events` batch endpoint (tenant opt-in, server-side GA4 Measurement Protocol / Plausible)
- Widget emits `{ event, properties, timestamp, sessionId }` — no PII in analytics payload by default (hash email server-side if needed)

---

## 12. Security model

### Threat model

| Threat | Mitigation |
|--------|------------|
| Stolen publishable key | Domain allowlist; rate limits; key rotation; test/live separation |
| Cross-tenant data access | Key → single tenant; RLS unchanged |
| Scraping catalog/prices | Rate limits; optional CAPTCHA on search (Phase 3+) |
| Hold exhaustion DoS | Per-IP hold limits; short TTL; WAF |
| XSS in widget host page | iframe sandbox option; CSP docs for operators |
| CSRF on Storefront API | Not cookie-based; Bearer token + Origin check |
| Booking spam | Rate limit POST /bookings; email verification optional Phase 3+ |
| Idempotency replay | Idempotency-Key store with 24h TTL |

### Publishable key format

```
pk_test_{base62_24}   // test environment
pk_live_{base62_24}   // production
```

Stored as hash in DB; raw key shown once at creation. Admin UI: rotate, revoke, set allowlist.

### StorefrontContext (application layer)

```typescript
interface StorefrontContext {
  tenantId: string;
  environment: 'test' | 'live';
  publishableKeyId: string;
  allowedDomains: string[];
  requestOrigin: string | null;
  locale: string;
  sessionId: string | null;
}
```

Use cases validate `StorefrontContext` instead of `ActorContext`. Permission model: implicit scoped access to published catalog + commerce create operations for that tenant.

### Published catalog gate

Only properties/units with `status: published` (new catalog status or `publishedAt` flag — ADR-017 required) appear on Storefront API.

---

## 13. Domain allowlist

### Rules

- Each publishable key has `allowed_domains: string[]`
- Entries: `example.com`, `*.example.com`, `localhost:3000` (test keys only)
- Browser requests: `Origin` header must match
- Server-side SDK: optional `Referer` or registered `serverDomains[]` for SSR/BFF
- iframe parent origin validated via `postMessage` + `Referer`

### Admin configuration

```
Settings → Storefront → Publishable keys → Edit allowlist
```

Validation on save: valid hostname patterns, no wildcards on TLD-only.

### Failure mode

403 `DOMAIN_NOT_ALLOWED` — widget shows operator-contact message, logs request for admin review.

---

## 14. Rate limiting strategy

### Layers

| Layer | Scope | Limits (initial) |
|-------|-------|------------------|
| Edge / middleware | IP | 300 req/min global per IP |
| Publishable key | key | 1000 req/min |
| Endpoint-specific | POST /holds | 10/min per IP |
| Endpoint-specific | POST /bookings | 5/min per IP |
| Search | POST /search/availability | 30/min per key |

### Implementation

- Phase 3: in-memory or Redis (if available) token bucket
- Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`
- Test keys: lower limits

### Abuse response

429 with `RATE_LIMITED` code; optional admin alert on sustained abuse.

---

## 15. Caching strategy

| Resource | Cache | TTL | Invalidation |
|----------|-------|-----|--------------|
| GET `/config` | CDN + browser | 5 min | Theme/key change |
| GET `/properties` | CDN | 1 min | Catalog publish event |
| GET `/properties/:slug` | CDN | 1 min | Property update outbox |
| POST availability | **No CDN** | — | Always dynamic |
| POST price preview | **No CDN** | — | Always dynamic |
| Holds/quotes/bookings | **Never cache** | — | — |

### Cache keys

`Cache-Tag: tenant-{id}, property-{slug}` for CDN purging (Vercel/Cloudflare).

### Stale catalog trade-off

Short TTL acceptable; availability always live-query.

---

## 16. SEO strategy

Phase 3 does **not** host tenant sites. SEO support is for **headless consumers**:

### Structured data contract

Document JSON-LD templates operators generate from Storefront catalog:

- `LodgingBusiness` / `Hotel` / `VacationRental` schema
- `Offer` with price valid for date range (from price preview endpoint)

### Sitemap hook

`GET /storefront/v1/sitemap/properties.xml?key=pk_live_xxx` — optional authenticated sitemap for operator cron fetch.

### URL stability

- Property and unit slugs immutable after first publish (redirect on rename)
- `confirmationCode` in booking lookup — no UUID in guest emails

### iframe SEO

iframe content not indexed on operator domain; operators should use SSR catalog pages + embed widget for booking only.

---

## 17. Multi-language strategy

### Locale resolution order

1. `X-HCP-Locale` header / widget prop
2. Publishable key default locale
3. Tenant `defaultLocale`
4. `Accept-Language` parsing
5. Fallback `en-US`

### Message catalogs

- `packages/widget-react/locales/{locale}.json`
- API error messages localized server-side via `@hcp/i18n` package (Phase 3)
- Phase 3 launch locales: `en-US`, `el-GR` (tenant default currency EUR)

### Content vs chrome

- Widget chrome (buttons, errors): i18n package
- Property name/description: Phase 4 CMS; Phase 3 returns catalog fields as stored (single language) with `locale` param reserved

---

## 18. Versioning strategy

### API

- URL path versioning: `/api/storefront/v1`
- Breaking changes → `/v2` with 12-month deprecation window
- Non-breaking: add fields, new endpoints

### Widget / SDK semver

| Package | Version | Compatibility |
|---------|---------|---------------|
| `@hcp/storefront-sdk` | semver | Matches API v1 |
| `@hcp/widget-react` | semver | Peer dep on SDK |
| `@hcp/widget-embed` | `v1` in CDN path | Loader pins compatible widget version |

### Feature flags

`GET /config` returns `features: { multiUnitCart: false, payments: true }` — clients adapt without version bump.

---

## 19. Folder structure additions

```
packages/
  storefront-sdk/           # Typed API client, no React
    src/
      client.ts
      types/
      errors.ts
  widget-react/             # React components
    src/
      components/
      hooks/
      locales/
      theme/
  widget-embed/             # Vanilla loader + mount
    src/
      loader.ts
      mount.ts
  i18n/                     # Shared message catalogs (optional Phase 3)

apps/web/
  app/
    api/storefront/v1/      # Public API routes
      config/route.ts
      properties/route.ts
      properties/[slug]/route.ts
      units/[unitId]/availability/check/route.ts
      search/availability/route.ts
      holds/route.ts
      quotes/route.ts
      bookings/route.ts
    (storefront)/
      book/                 # iframe hosted widget page
        page.tsx
  lib/
    storefront/
      StorefrontContext.ts
      publishableKeyAuth.ts
      domainAllowlist.ts
      rateLimit.ts
      mappers/
      use-cases/            # Thin wrappers → Phase 2 use cases
  embed/                    # Static embed script build output

packages/domain/src/
  storefront/               # Optional Phase 3A domain
    ports/
      IPublishableKeyRepository.ts
      IStorefrontCatalogQueryPort.ts
    application/
      ValidateStorefrontAccess.ts

packages/database/
  prisma/
    # tenant_publishable_keys
    # tenant_theme_profiles
    # storefront_idempotency_keys

docs/
  phase-3-storefront-design.md   # this document
  adr/
    017-published-catalog-status.md   # to write
    018-publishable-keys.md
    019-storefront-api-auth.md
```

---

## 20. Tests required

### Storefront API (integration)

- Publishable key auth: valid, invalid, revoked
- Domain allowlist: allowed, blocked, wildcard subdomain
- Catalog: unpublished property returns 404
- Availability check happy path + MIN_NIGHTS error shape
- Search availability across multiple units
- Hold → quote → booking E2E (test key + test environment)
- Idempotency-Key replay returns same booking
- Rate limit 429 responses

### Widget (component / E2E)

- React: date selection → price display → mock booking success
- Embed loader mounts with data attributes
- iframe postMessage round-trip (ready, resize, completed)
- Theme CSS variables applied
- Locale switches error strings
- Hold expiry countdown triggers re-quote prompt

### SDK (unit)

- Request signing headers
- Error parsing
- Type narrowing on responses

### Security

- Cannot access `/api/admin/v1` with publishable key
- Cross-tenant unit ID with wrong key → 404
- Origin spoof attempt blocked

### Performance

- Search availability p95 &lt; 500ms (10 properties, 1 unit each)
- Widget LCP budget on sample operator page

---

## 21. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Phase 2 delay blocks Storefront API | Schedule slip | Design SDK/widget against OpenAPI mock; contract-first |
| Publishable key leaked | Scraping, hold abuse | Allowlist + rate limits + rotation |
| iframe + third-party cookies | Payment failures | Use provider redirect or Stripe Payment Element in iframe with `allow="payment"` |
| Multi-unit property UX confusion | Guest books wrong unit | Clear unit selector; search shows unit name |
| CSP conflicts on embed | Widget won't load | iframe fallback documented |
| Catalog without CMS | Thin property pages | Phase 3 minimal fields; Phase 4 enriches |
| SEO duplicate content | iframe vs SSR | Document best practices |
| Version skew embed CDN vs API | Runtime errors | Loader fetches compatible version from `/config/widget` |
| GDPR / consent for analytics | Compliance | Opt-in analytics hooks; no auto PII to third parties |

---

## 22. Acceptance criteria

1. Operator creates publishable key with domain allowlist in admin UI
2. Guest completes booking on external static HTML page via embed script (test mode)
3. Guest completes booking via React widget in sample Next.js app
4. Guest completes booking via iframe on CSP-restricted sample page
5. Headless SDK can run search → availability → book without widget UI
6. Widget emits `booking_completed` event consumed by host page listener
7. Theme primary color applied from tenant config
8. `el-GR` locale shows Greek widget strings
9. Unpublished property invisible on Storefront API
10. Rate limit returns 429 under load test threshold
11. Storefront API has zero dependency on Auth.js session
12. All Storefront routes use Phase 2 commerce use cases (no duplicated business logic)
13. Playwright E2E covers embed + iframe happy paths
14. OpenAPI spec published at `/api/storefront/v1/openapi.json`

---

## 23. Implementation order

### Phase 3A — Contract & SDK (can start before Phase 2B)

1. ADRs 017–019 (published catalog, publishable keys, storefront auth)
2. OpenAPI spec for Storefront API v1
3. `@hcp/storefront-sdk` against mock server (MSW / Prism)
4. ThemeConfig schema + default tokens
5. WidgetEvent type definitions shared package

### Phase 3B — API & auth (requires Phase 2B/2C)

6. DB: `tenant_publishable_keys`, theme profiles, idempotency keys
7. `StorefrontContext` + publishable key middleware
8. Storefront catalog read endpoints (published filter)
9. Wire availability/price/hold/quote/booking to Phase 2 use cases
10. Domain allowlist + rate limiting middleware
11. Integration tests with real PostgreSQL

### Phase 3C — Widget UI

12. `@hcp/widget-react` core flow
13. `@hcp/widget-embed` loader
14. iframe hosted page + postMessage
15. Admin UI: keys, allowlist, theme editor
16. Playwright E2E (embed + iframe)

### Phase 3D — Polish & extensions

17. Search availability endpoint
18. i18n (`en-US`, `el-GR`)
19. SEO sitemap + JSON-LD docs
20. Analytics adapter hooks (stub)
21. CMS content ID hooks in catalog DTO (stub fields for Phase 4)
22. Multi-unit cart (stretch)

---

## What can be designed now

- Full Storefront API contract (OpenAPI)
- SDK public interface and error model
- React component API and widget state machine
- JS embed snippet and loader behavior
- iframe protocol and hosted page routing
- ThemeConfig schema and CSS variable system
- WidgetEvent / analytics event schema
- Security model, allowlist rules, rate limit tiers
- Caching, SEO, i18n, versioning policies
- Folder structure and ADR drafts 017–019
- Mock-server-driven widget prototyping

**No database, Prisma, or live API implementation required for design work.**

---

## What must wait until Phase 2B/2C is ready

- Publishable key persistence and rotation storage
- Storefront routes calling real hold/quote/booking use cases
- Published catalog status on properties/units
- Search availability against live inventory
- Integration tests with EXCLUDE constraint / concurrency
- Payment-intent endpoints (Phase 2.5)
- Admin UI for key management (depends on auth + DB)
- Production rate limiting with Redis (optional infra)
- CDN cache purge wired to catalog outbox events

---

## Recommended implementation order

```
Design (now)
  → OpenAPI + ADRs 017–019 + shared types
  → storefront-sdk (mock-backed)
  → widget-react prototype (mock-backed)

Phase 2B/2C complete
  → publishable keys + StorefrontContext
  → catalog + commerce Storefront routes
  → integration tests

Phase 3C
  → embed script + iframe + admin key UI
  → E2E + documentation

Phase 3D / Phase 4 handoff
  → search polish, i18n, SEO docs, CMS field stubs
```

Phase 3 **must not duplicate** commerce logic — Storefront layer is **auth + DTO mapping + UX** on top of Phase 2 application services. Widget packages remain free of `@hcp/domain` imports; they talk HTTP only.

---

## ADRs to author (Phase 3)

| ADR | Title |
|-----|-------|
| **ADR-017** | Published catalog visibility (`published` status for Storefront) |
| **ADR-018** | Publishable keys (`pk_test_` / `pk_live_`, hashing, rotation) |
| **ADR-019** | Storefront API authentication (Bearer key + domain allowlist, no session) |
| **ADR-020** | Widget delivery (embed vs iframe vs React SDK) |
| **ADR-021** | Storefront API versioning and compatibility |

---

*End of Phase 3 design document.*
