# ADR-020: Widget Delivery (Embed vs iframe vs React SDK)

## Status
Accepted

## Context
Operators use diverse stacks (React, WordPress, static HTML, strict CSP). HCP must support multiple integration paths without duplicating commerce logic.

## Decision
Three delivery modes share one Storefront API contract:

| Mode | Package | Integration |
|------|---------|-------------|
| **React SDK** | `@hcp/widget-react` | `<BookingWidget />` + provider |
| **JS embed** | `@hcp/widget-embed` | `<script>` + `data-hcp-*` attributes |
| **iframe fallback** | `@hcp/widget-embed` | Hosted page + `postMessage` |

Shared:

- `@hcp/storefront-sdk` for types, errors, and HTTP client (mock in Phase 3A).
- Theme via CSS custom properties (`--hcp-color-*`).
- `WidgetEvent` lifecycle callbacks across React props, `window.HCP.on`, and iframe `postMessage`.

Phase 3A ships interfaces and mock implementations only; CDN bundle and hosted iframe page arrive in Phase 3C.

## Consequences
- No `@hcp/domain` import in widget packages.
- Embed loader lazy-loads React widget chunk in Phase 3C.
- iframe protocol versioned alongside SDK semver.
