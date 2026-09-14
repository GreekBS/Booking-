# Phase 3A — Storefront SDK & Widget Audit

**Date:** 2025-06-26  
**Scope:** Frontend-safe contracts, mock SDK, widget skeletons (no API, DB, auth)  
**Design reference:** `docs/phase-3-storefront-design.md`  
**ADRs:** 017–021

---

## Packages

| Package | Purpose |
|---------|---------|
| `@hcp/storefront-sdk` | DTOs, Zod validation, errors, `IStorefrontClient`, `MockStorefrontClient` |
| `@hcp/widget-react` | `BookingWidget` skeleton, provider, theme CSS vars, mock-only flow |
| `@hcp/widget-embed` | Embed config parser, iframe postMessage contract, `window.HCP` init API |

## ADRs

- `docs/adr/017-published-catalog-status.md`
- `docs/adr/018-publishable-keys.md`
- `docs/adr/019-storefront-api-auth.md`
- `docs/adr/020-widget-delivery.md`
- `docs/adr/021-storefront-api-versioning.md`

## Architecture boundaries

- No `@hcp/domain`, `@hcp/database`, Prisma, Next.js, or Supabase imports
- Widget packages depend only on `@hcp/storefront-sdk`
- Mock client performs no HTTP fetch
- Phase 3B will add `HttpStorefrontClient` + real routes

## Tests

| Package | Tests |
|---------|-------|
| storefront-sdk | Key/theme validation, mock Hold→Quote→Booking |
| widget-react | Event callbacks, mock booking UI flow, theme CSS vars |
| widget-embed | Embed attributes, postMessage, iframe URL, global API |

---

## Example: HTML embed snippet

```html
<div
  id="hcp-booking"
  data-hcp-key="pk_test_mock00000000000001"
  data-hcp-unit="unit-villa-entire"
  data-hcp-locale="en-US"
  data-hcp-mode="inline"
  data-hcp-mock="true"
></div>
<script type="module">
  import { initEmbed, registerGlobalApi } from "@hcp/widget-embed";

  registerGlobalApi();
  window.HCP.init({
    publishableKey: "pk_test_mock00000000000001",
    unitId: "unit-villa-entire",
    mockMode: true,
    mode: "inline",
    containerId: "hcp-booking",
  });

  window.HCP.on("booking_completed", (event) => {
    if (event.type === "booking_completed") {
      console.log("Booked:", event.confirmationCode);
    }
  });
</script>
```

## Example: React usage

```tsx
import { BookingWidget } from "@hcp/widget-react";
import { MOCK_PUBLISHABLE_KEY } from "@hcp/storefront-sdk";

export function PropertyBookPage() {
  return (
    <BookingWidget
      publishableKey={MOCK_PUBLISHABLE_KEY}
      unitId="unit-villa-entire"
      mockMode
      locale="en-US"
      onEvent={(event) => {
        if (event.type === "booking_completed") {
          console.log(event.confirmationCode);
        }
      }}
    />
  );
}
```

## Example: Theme config

```typescript
import { defaultTheme, mergeThemes, themeToCssVariables } from "@hcp/storefront-sdk";

const brandTheme = mergeThemes(defaultTheme, {
  preset: "light",
  colors: {
    primary: "#1a5f4a",
    primaryForeground: "#ffffff",
    background: "#fafafa",
    foreground: "#1f2937",
    muted: "#f3f4f6",
    border: "#e5e7eb",
    success: "#059669",
    error: "#dc2626",
  },
  typography: {
    fontFamily: "Inter, system-ui, sans-serif",
    baseFontSize: "16px",
  },
  radius: { sm: "6px", md: "10px", lg: "16px" },
});

const cssVars = themeToCssVariables(brandTheme);
```

## Example: iframe fallback

```html
<iframe
  src="https://book.hcp.example/w/mock?unit=unit-villa-entire&locale=el-GR&key=pk_test_mock00000000000001"
  title="Book your stay"
  width="100%"
  height="680"
  allow="payment"
></iframe>
<script type="module">
  window.addEventListener("message", (event) => {
    if (event.data?.namespace !== "hcp") return;
    const msg = event.data.payload;
    if (msg.type === "hcp:booking_completed") {
      console.log(msg.confirmationCode);
    }
  });
</script>
```

---

## Missing (Phase 3B+)

- HTTP client + real Storefront API routes
- Publishable key persistence
- Domain allowlist enforcement server-side
- CDN embed bundle
- Hosted iframe page in `apps/web`
- Live payment widget step

## Verdict

**Phase 3A complete** — contracts, mocks, widget skeletons, tests, and ADRs ready for Phase 3B integration.
