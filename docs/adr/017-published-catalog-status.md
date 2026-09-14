# ADR-017: Published Catalog Visibility

## Status
Accepted

## Context
Storefront API and widgets must expose only operator-approved properties and units. Admin catalog includes draft and archived records that must not appear on public channels.

## Decision
Introduce a **published** visibility gate for Storefront catalog reads:

- Properties and units eligible for Storefront API have `status: published` (or equivalent `publishedAt` timestamp set).
- Admin API continues to manage full lifecycle (`draft`, `published`, `archived`).
- Unpublished resources return **404** on Storefront API (not 403) to avoid leaking existence.
- Phase 3A defines DTOs and mock fixtures with `published` status only; persistence lands in Phase 3B.

## Consequences
- Storefront mappers filter by published status in Phase 3B.
- CMS (Phase 4) attaches content to published catalog entities by stable slug.
- Widget mock mode uses published fixture data exclusively.
