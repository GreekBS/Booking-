# Phase 4: Property CMS + Digital Asset Manager — Architecture & Design Document

**Status:** Design (no implementation)  
**Depends on:** Phase 1 Platform Kernel + Catalog, Phase 2 Commerce Core, Phase 3 Storefront / Widget layer  
**Dependency note:** Phase 4 **design can proceed now**. Implementation requires Phase 1 catalog, Phase 3 Storefront read paths, and tenant isolation patterns already defined in code. No production DB verification is required to finalize this design.

---

## 1. Goals

Phase 4 introduces the **Content** bounded context: operators can author rich, multilingual property marketing pages and manage media assets, consumed by headless Storefront integrations and future hosted sites.

| Goal | Success measure |
|------|-----------------|
| **Rich property pages** | Operators build structured pages (sections) without code |
| **Multilingual marketing** | Content available per locale with fallback chain |
| **SEO-ready output** | Meta tags, OG images, JSON-LD consumable by operator sites |
| **Centralized media** | DAM with folders, tags, alt text, reusable across properties |
| **Optimized delivery** | Responsive image variants with CDN-friendly URLs |
| **Safe publishing** | Draft → review → publish without breaking live Storefront |
| **Tenant isolation** | All content and assets scoped by `tenantId` + RLS |
| **Storefront integration** | Storefront API returns published content by slug + locale |
| **AI-ready** | Provider-agnostic ports for future content/alt-text assistants |
| **Catalog separation** | Commerce/catalog facts unchanged; CMS enriches presentation only |

---

## 2. Scope

### In scope (Phase 4)

1. **Property CMS** — structured page content bound to catalog `Property` (and optionally `Unit`)
2. **Section schema** — typed, ordered sections (hero, gallery, text, amenities, map, CTA, etc.)
3. **Multilingual content** — locale-specific fields with tenant default fallback
4. **SEO module** — per-locale title, description, canonical, OG/Twitter, robots, JSON-LD hints
5. **Digital Asset Manager (DAM)** — upload, folder tree, tags, metadata, alt text
6. **Media references** — sections reference assets by ID; gallery ordering
7. **Image optimization** — derivative generation strategy (variants + lazy processing)
8. **Draft / publish workflow** — content versions; single published snapshot per property+locale
9. **Admin UI** — content editor, media library, publish controls (extends `apps/web`)
10. **Admin API** — `/api/admin/v1/content/...`, `/api/admin/v1/media/...`
11. **Storefront API extension** — `GET /properties/:slug/content` (published only)
12. **RLS + RBAC** — content permissions; property-scoped manager access
13. **Domain events + outbox** — `ContentPublished`, `AssetUploaded`, etc.
14. **AI assistant hooks** — ports only; stub adapters acceptable in Phase 4

### Assumed from prior phases

| Phase | Capability used |
|-------|-----------------|
| Phase 1 | Tenant, Property, Unit, RBAC, RLS pattern, audit log, outbox |
| Phase 2 | Published catalog gate (ADR-017 alignment) |
| Phase 3 | Storefront API, `contentRefId` stub, locale param, publishable keys |

---

## 3. Out of scope

| Excluded | Target |
|----------|--------|
| Full website builder (multi-page sites, navigation trees) | Phase 4+ / Phase 5 |
| Blog / news / destination guides | Phase 5+ |
| Video transcoding pipeline | Phase 5+ |
| WYSIWYG free-form HTML blocks (unrestricted) | Avoid XSS; structured sections only |
| Live AI provider integration (OpenAI, etc.) | Phase 4 ports + stub; Phase 4.5+ adapters |
| Operator-hosted CDN configuration UI | Phase 5+ |
| Automatic translation | Phase 5+ (AI hook prepares for it) |
| Content A/B testing | Phase 6+ |
| Guest-facing CMS (UGC reviews in CMS) | Phase 5+ |
| Email template CMS | Phase 5+ |
| PDF brochure generation | Phase 5+ |
| Supabase-specific features (Storage RLS UI, etc.) | Platform-agnostic storage port |

---

## 4. Bounded context architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CONTENT CONTEXT (Phase 4)                        │
├─────────────────────────────────────────────────────────────────────┤
│  PropertyContent (aggregate)     MediaAsset (aggregate)             │
│  ContentVersion (entity)         MediaFolder (entity/aggregate)     │
│  ContentSection[] (VO/entities)  AssetVariant[] (entity)            │
│  SeoMetadata (VO)                Tag (entity)                       │
│                                                                     │
│  ContentPublishService           AssetProcessingService (domain)    │
│  LocaleFallbackResolver          IImageOptimizer (port)               │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ references (read-only catalog IDs)
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CATALOG (Phase 1) — Property, Unit, slug, timezone, amenities     │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ published content read
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STOREFRONT (Phase 3) — GET /properties/:slug/content?locale=       │
└─────────────────────────────────────────────────────────────────────┘
```

**ADR-004 upheld:** Catalog `Property` keeps operational fields (timezone, policies, location coordinates). Marketing copy, galleries, and SEO live in **Content** context only.

**Link model:** `PropertyContent.propertyId` FK → `properties.id`. Optional `unitId` for unit-specific content pages (e.g. hotel room types). Storefront resolves via catalog slug → IDs.

---

## 5. Property CMS content model

### Aggregate: `PropertyContent`

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Content aggregate root |
| `tenantId` | UUID | Tenant scope |
| `propertyId` | UUID | FK catalog property |
| `unitId` | UUID? | Optional; null = property-level page |
| `status` | enum | `draft` \| `published` \| `archived` |
| `publishedVersionId` | UUID? | Pointer to live snapshot |
| `draftVersionId` | UUID? | Working copy |
| `createdAt` / `updatedAt` | timestamptz | |

**Invariant:** At most one `PropertyContent` root per `(tenantId, propertyId, unitId?)`.

### Entity: `ContentVersion`

Immutable snapshot candidate (mutable while draft; frozen on publish).

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | |
| `contentId` | UUID | Parent aggregate |
| `versionNumber` | int | Monotonic per content root |
| `locale` | string | BCP-47 primary locale for this version row |
| `sections` | JSONB | Ordered section array (validated schema) |
| `seo` | JSONB | SeoMetadata |
| `state` | enum | `draft` \| `published` \| `superseded` |
| `publishedAt` | timestamptz? | |
| `publishedBy` | UUID? | User |
| `createdAt` | timestamptz | |

**Multilingual strategy:** One **ContentVersion row per locale** per draft/publish cycle (not one row with nested locale map). Simplifies partial publish, translator workflows, and RLS. Fallback resolved at read time (see §7).

### Relationship to catalog publish state

| Catalog `Property.status` | CMS behavior |
|---------------------------|--------------|
| `draft` | CMS editable; Storefront 404 |
| `active` / published gate | CMS can publish; Storefront serves published content |
| `archived` | CMS read-only; Storefront 404 |

Align ADR-017: introduce catalog `published` or map `active` + `publishedAt` — CMS publish requires catalog to be storefront-visible.

---

## 6. Section schema

Sections are **typed blocks** in a ordered array. No arbitrary HTML strings at root level (mitigates XSS). Rich text allowed only inside validated `richtext` fields with sanitization at infrastructure boundary.

### Section base shape

```typescript
interface ContentSectionBase {
  id: string;           // stable UUID within version
  type: SectionType;
  sortOrder: number;
  visible: boolean;
  settings?: Record<string, unknown>; // type-specific layout flags
}
```

### Section types (Phase 4 v1)

| Type | Purpose | Key fields |
|------|---------|------------|
| `hero` | Above-the-fold | `headline`, `subheadline`, `backgroundAssetId?`, `ctaLabel?`, `ctaUrl?` |
| `gallery` | Image grid/carousel | `assetIds[]`, `layout`: `grid` \| `carousel` |
| `richtext` | Long description | `body` (sanitized markdown/subset HTML) |
| `amenities` | Feature list | `displayMode`: `from_catalog` \| `custom`; `customItems[]?` |
| `location` | Map + directions | `showMap`, `directionsText?` (coords from catalog) |
| `highlights` | Bullet selling points | `items[]`: `{ icon?, title, text }` |
| `policies` | House rules | `items[]` or `syncFromCatalog: boolean` |
| `faq` | Q&A accordion | `items[]`: `{ question, answer }` |
| `cta` | Booking call-to-action | `headline`, `widgetEmbed?`, `buttonLabel` |
| `split` | Image + text columns | `assetId`, `headline`, `body`, `imagePosition` |

### Schema validation

- JSON Schema / Zod definitions in `@hcp/content-schemas` package (Phase 4B).
- Admin API rejects unknown `type` or invalid payloads (`400 VALIDATION_ERROR`).
- Version migration: additive section types only within v1; breaking changes → content schema v2.

### Unit-level content

Hotel room pages: same section types with `unitId` set on `PropertyContent`. Property-level page remains default; unit pages optional.

---

## 7. Multilingual content

### Supported locales

- Stored on tenant: `defaultLocale` (Phase 1) + `supportedLocales[]` in tenant settings (Phase 4).
- Phase 4 launch: `en-US`, `el-GR` (align Phase 3 i18n).

### Authoring model

- Editor selects **locale tab** → edits `ContentVersion` for that locale.
- Each locale has independent draft/publish state **or** synchronized publish (configurable tenant flag):
  - **Default (recommended):** Publish locales independently — Greek live while English draft.
  - **Optional:** `publishAllLocales` action copies publish event to all locales with draft versions.

### Fallback chain (Storefront read)

```
requested locale → tenant defaultLocale → en-US → first available published version
```

`LocaleFallbackResolver` domain service returns `{ content, resolvedLocale, fallbackUsed }`.

### Translation status (metadata)

Per locale version:

| Field | Values |
|-------|--------|
| `translationStatus` | `source` \| `machine` \| `human` \| `missing` |
| `sourceLocale` | BCP-47 if translated |

Enables future AI translation without blocking Phase 4 launch.

### Slug / URL note

Property slug remains **locale-neutral** (catalog). Localized **slug aliases** deferred to Phase 5; SEO canonical uses catalog slug.

---

## 8. SEO fields

### Value object: `SeoMetadata` (per ContentVersion / locale)

| Field | Required | Notes |
|-------|----------|-------|
| `metaTitle` | recommended | ≤ 60 chars soft limit |
| `metaDescription` | recommended | ≤ 160 chars soft limit |
| `canonicalUrl` | optional | Operator override; default computed |
| `robots` | optional | `index,follow` default for published |
| `ogTitle` | optional | Falls back to metaTitle |
| `ogDescription` | optional | Falls back to metaDescription |
| `ogImageAssetId` | optional | DAM asset; variant `og` (1200×630) |
| `twitterCard` | optional | `summary_large_image` default |
| `structuredDataHints` | optional | JSON-LD partials (see below) |

### JSON-LD strategy (headless)

Storefront content response includes `structuredData` object (not raw script tag):

```json
{
  "@type": "VacationRental",
  "name": "...",
  "description": "...",
  "image": ["https://cdn.../og.webp"],
  "address": { /* from catalog */ },
  "containsPlace": { /* unit summaries */ }
}
```

Operator site injects into `<script type="application/ld+json">`. HCP validates shape; does not guarantee Google rich results.

### SEO validation (admin)

- Warn if `metaTitle` / `metaDescription` missing on publish.
- Warn if `ogImageAssetId` unset (use first gallery hero).
- Block publish optional: tenant setting `requireSeoForPublish`.

### Sitemap extension (Phase 4)

`GET /api/storefront/v1/sitemap/content.xml` — published properties with `lastmod` from content publish date, `hreflang` alternates per locale.

---

## 9. Gallery and media references

### Reference pattern

Sections reference assets by **`assetId` (UUID)** only — never embed storage paths in content JSON.

```json
{
  "type": "gallery",
  "assetIds": ["uuid-1", "uuid-2"],
  "layout": "carousel"
}
```

### Resolved asset DTO (Storefront / admin preview)

| Field | Description |
|-------|-------------|
| `id` | Asset UUID |
| `url` | CDN URL for requested variant |
| `width`, `height` | Intrinsic |
| `altText` | Locale-specific or default |
| `caption` | Optional per reference override in section |
| `focalPoint` | `{ x, y }` 0–1 for crop |

### Gallery ordering

Order defined by `assetIds` array order. DAM browse order independent.

### Broken reference handling

- Publish allowed with warning if asset deleted/archived.
- Storefront omits missing assets; logs `CONTENT_BROKEN_REF` server-side.
- Admin UI shows placeholder + fix prompt.

### Hero / OG fallbacks

Publish pipeline: if `seo.ogImageAssetId` null → first `hero.backgroundAssetId` → first `gallery` image.

---

## 10. DAM: folders, tags, alt text

### Aggregate: `MediaAsset`

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | |
| `tenantId` | UUID | |
| `folderId` | UUID? | Root if null |
| `filename` | string | Original name |
| `mimeType` | string | `image/*`, `image/svg+xml`, `application/pdf` (Phase 4: images only) |
| `byteSize` | bigint | |
| `width`, `height` | int? | After probe |
| `storageKey` | string | Opaque; infrastructure |
| `status` | enum | `uploading` \| `processing` \| `ready` \| `failed` \| `archived` |
| `checksum` | string | SHA-256 |
| `createdBy` | UUID | |
| `createdAt` | timestamptz | |

### Entity: `MediaFolder`

Tree per tenant: `/`, `/properties/{slug}`, custom folders. Max depth 8.

| Field | Notes |
|-------|-------|
| `id`, `tenantId`, `parentId?`, `name`, `slug` | Unique `(tenantId, parentId, slug)` |

### Tags

Many-to-many `asset_tags`: normalized tag names per tenant (`pool`, `exterior`, `bedroom`). Autocomplete in admin UI.

### Alt text and captions

**Entity: `AssetLocaleMetadata`** (per asset + locale):

| Field | Notes |
|-------|-------|
| `assetId`, `locale` | PK |
| `altText` | Required for publish if asset used in published content (warn) |
| `caption` | Optional |
| `translationStatus` | Same as content |

Default locale alt required on upload; others optional with fallback.

### Permissions

| Action | admin | manager (scoped) |
|--------|-------|------------------|
| Upload / delete asset | tenant | assigned properties folder only |
| View library | tenant | assigned |
| Use in content | tenant | assigned property content |

---

## 11. Image optimization strategy

### Principles

- **Never** serve original multi-MB uploads to Storefront.
- Generate **variants** asynchronously after upload.
- Storage backend **agnostic** via `IObjectStorage` + `IImageProcessor` ports (S3-compatible, local disk dev, etc.).
- No Supabase-specific coupling in domain.

### Variant set (Phase 4)

| Variant | Max dimensions | Format | Use |
|---------|----------------|--------|-----|
| `thumb` | 320w | WebP | Admin grid, lazy placeholders |
| `card` | 768w | WebP | Listing cards |
| `large` | 1920w | WebP | Hero, gallery lightbox |
| `og` | 1200×630 crop | JPEG/WebP | Open Graph |
| `original` | — | preserved | Download admin only; not on Storefront |

### Processing pipeline

```
Upload (presigned URL) → Asset status: uploading
  → Confirm upload → processing
  → Probe metadata → Generate variants (queue/worker)
  → status: ready → emit AssetProcessed event
```

- Worker: Phase 4C (can use sharp in infrastructure package).
- Failed processing: `failed` status + retry; admin notification.
- SVG: passthrough or reject (tenant setting); no rasterization in Phase 4.

### CDN URLs

`IAssetUrlResolver` returns versioned public URL:

```
https://{cdn}/{tenantId}/assets/{assetId}/{variant}.webp?v={contentHash}
```

Cache-Control: `public, max-age=31536000, immutable` for variant URLs (hash in path/query).

### Focal point

Optional `{ x, y }` on asset; crop variants respect focal point for `og` and `card`.

### Responsive images (Storefront DTO)

```json
{
  "src": ".../large.webp",
  "srcSet": ".../card.webp 768w, .../large.webp 1920w",
  "sizes": "(max-width: 768px) 100vw, 1200px"
}
```

Computed at map time, not stored in CMS JSON.

---

## 12. Storefront API future integration

Extends Phase 3 Storefront API (Phase 4B) — **design only here**.

### New / extended endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/properties/:slug/content` | Published content for locale |
| GET | `/properties/:slug/content/seo` | SEO-only payload (optional split) |
| GET | `/properties/:slug/units/:unitSlug/content` | Unit page content |
| GET | `/media/:assetId` | Public metadata + variant URLs (published assets only) |

### Query params

- `locale` (required or default from key)
- `resolve=full` — inline resolved assets in sections (default for widgets)

### Response shape (abbreviated)

```json
{
  "data": {
    "propertyId": "...",
    "slug": "aegean-villa",
    "locale": "el-GR",
    "resolvedLocale": "el-GR",
    "fallbackUsed": false,
    "publishedAt": "2025-08-01T12:00:00Z",
    "sections": [ /* typed, assets resolved */ ],
    "seo": { /* SeoMetadata + ogImageUrl */ },
    "structuredData": { /* JSON-LD hints */ }
  },
  "meta": { "requestId": "...", "locale": "el-GR" }
}
```

### Caching

- CDN cache keyed by `(slug, locale, contentPublishedAt)`.
- `ETag` from `publishedVersionId + locale`.
- Purge on `ContentPublished` outbox consumer.

### Widget integration

`BookingWidget` optional prop `contentSlug` — Phase 4 loads hero headline from content API for display-only (no booking logic change).

### `contentRefId`

Phase 3A stub maps to `PropertyContent.id` for analytics and CMS deep links.

---

## 13. Admin editing workflow

### Personas

| Persona | Capabilities |
|---------|--------------|
| **admin** | All properties, publish, DAM all folders |
| **manager** | Assigned properties only |
| **super_admin** | Cross-tenant (platform) read for support; no content edit by default |

### Editor UX flow (apps/web)

1. **Property list** → Content status badge: `No content` \| `Draft` \| `Published` \| `Out of date`
2. **Content editor** — locale tabs, section list (drag reorder), section form per type
3. **Media picker** — modal from DAM; filter by folder/tags
4. **Preview** — draft preview URL (admin auth); optional Phase 4C share link with token
5. **SEO panel** — side drawer with character counts + OG preview
6. **Publish** — confirmation modal; lists locales to publish; validation warnings
7. **History** — version list; read-only diff (section-level, Phase 4 stretch)

### Autosave

- Draft saved every 30s via `PATCH /content/:id/draft` (debounced).
- Optimistic UI; conflict detection via `draftVersion.updatedAt` etag.

### Audit

All publish/archive actions → `audit_logs` (Phase 1 pattern):

`content.publish`, `content.unpublish`, `asset.upload`, `asset.delete`

---

## 14. Versioning, drafts, and publishing

### State machine: PropertyContent

```
[no content] → draft → published → draft (new edits) → published
                  ↘ archived ↗
```

### Publish semantics

1. Validate section schema + SEO warnings.
2. Freeze draft `ContentVersion` → mark `published`; previous published → `superseded`.
3. Update `PropertyContent.publishedVersionId` and `status: published`.
4. Emit `ContentPublished` outbox event with `{ propertyId, locales[], versionIds[] }`.
5. Optional: bump catalog `updatedAt` for sitemap.

### Unpublish

- Sets content status `draft`; Storefront returns 404 for content endpoint (catalog may still show minimal DTO).
- Emits `ContentUnpublished`.

### Rollback (Phase 4 stretch)

- Repoint `publishedVersionId` to prior `superseded` version (same locale).
- Emits `ContentRollback`.

### No live editing of published JSON

Same immutability principle as Quote snapshots (ADR-012): published versions are read-only; edits create new draft from copy.

---

## 15. RLS and tenant isolation design

### Table pattern (all content/DAM tables)

- `tenant_id UUID NOT NULL` FK → `tenants`
- Index `(tenant_id, ...)`
- RLS enabled matching Phase 1 migration pattern:

```sql
-- illustrative; not a migration
CREATE POLICY tenant_isolation ON property_contents
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

### Session context

Reuse `setTenantContext(tenantId)` (Phase 1 database package) on every request before queries.

### Defense in depth

| Layer | Check |
|-------|-------|
| API | Auth.js session + membership |
| Use case | `propertyId` belongs to `tenantId`; manager property scope |
| Repository | All queries filter `tenantId` |
| RLS | PostgreSQL policy |
| Storage | Prefix `{tenantId}/` on object keys; presigned URLs scoped |

### Cross-tenant asset reference

Content section referencing another tenant's `assetId` → validation failure at publish.

### Storefront public reads

No RLS bypass: Storefront use case resolves publishable key → `tenantId`, then reads only `published` content for that tenant.

---

## 16. Future AI content assistant hooks

Domain ports only — **no provider imports** in `@hcp/domain` or `@hcp/content`.

### Ports (Phase 4 definitions)

```typescript
interface IContentAssistant {
  suggestHeadline(context: PropertyContext, locale: string): Promise<string[]>;
  suggestMetaDescription(contentSummary: string, locale: string): Promise<string>;
  suggestAltText(imageUrl: string, locale: string): Promise<string>;
  expandRichtext(outline: string, locale: string): Promise<string>;
}

interface ITranslationAssistant {
  translateSections(sections: ContentSection[], from: string, to: string): Promise<ContentSection[]>;
}
```

### Infrastructure (Phase 4.5+)

- OpenAI / Anthropic / Azure adapters behind ports.
- Stub: returns placeholder strings in dev.

### Admin UX hooks

- "Suggest headline" button → calls use case → `IContentAssistant`.
- "Generate alt text" on asset → fills `AssetLocaleMetadata.altText` as draft for human review.
- **Human approval required** before publish; AI output marked `translationStatus: machine`.

### Safety

- Prompt templates in infrastructure, not user-editable in Phase 4.
- Rate limits per tenant; audit log records AI-assisted field changes.
- No automatic publish from AI.

---

## 17. Database design (summary — no migrations in this doc)

### New tables (conceptual)

| Table | Purpose |
|-------|---------|
| `property_contents` | Aggregate root |
| `content_versions` | Draft/published snapshots per locale |
| `media_folders` | DAM folder tree |
| `media_assets` | Asset metadata |
| `media_asset_variants` | Variant URLs + dimensions |
| `asset_locale_metadata` | Alt/caption per locale |
| `asset_tags` | Tag dictionary |
| `media_asset_tag_links` | M:M |
| `content_schema_migrations` | Optional tracking for JSON schema version |

### Storage

Binary blobs **not** in PostgreSQL. Object storage only.

---

## 18. API design (admin — summary)

**Prefix:** `/api/admin/v1` (Auth.js session)

### Content

| Method | Path | Use case |
|--------|------|----------|
| GET | `/properties/:propertyId/content` | Get or create content root |
| GET | `/properties/:propertyId/content/versions` | History |
| PUT | `/properties/:propertyId/content/draft/:locale` | Save draft sections + SEO |
| POST | `/properties/:propertyId/content/publish` | Publish `{ locales[] }` |
| POST | `/properties/:propertyId/content/unpublish` | Unpublish |
| GET | `/properties/:propertyId/content/preview/:locale` | Preview token URL |

### Media

| Method | Path | Use case |
|--------|------|----------|
| GET | `/media/folders` | List tree |
| POST | `/media/folders` | Create folder |
| GET | `/media/assets` | List/filter |
| POST | `/media/assets/upload-intent` | Presigned URL |
| POST | `/media/assets/:id/confirm` | Confirm + queue processing |
| PATCH | `/media/assets/:id/metadata` | Alt, tags, folder |
| DELETE | `/media/assets/:id` | Soft archive |

### Permissions (new)

```
content:read:tenant | content:read:assigned
content:edit:tenant | content:edit:assigned
content:publish:tenant | content:publish:assigned
media:read:tenant | media:read:assigned
media:upload:tenant | media:upload:assigned
media:delete:tenant
```

---

## 19. Domain events

| Event | Trigger |
|-------|---------|
| `ContentDraftSaved` | Autosave |
| `ContentPublished` | Publish |
| `ContentUnpublished` | Unpublish |
| `ContentRollback` | Rollback (stretch) |
| `AssetUploadStarted` | Presigned issued |
| `AssetProcessed` | Variants ready |
| `AssetArchived` | Delete |
| `AssetAltTextUpdated` | Metadata patch |

Consumers (future): CDN purge, search index, analytics, AI training opt-in (never default).

---

## 20. Folder structure additions (planned)

```
packages/
  content-schemas/          # Zod/JSON Schema for sections + SEO
  domain/src/content/       # PropertyContent, MediaAsset aggregates
  domain/src/media/         # Optional split bounded context modules

packages/database/
  repositories/             # Content + media repos
  prisma/                   # Phase 4 migrations (later)

apps/web/
  app/dashboard/properties/[id]/content/
  app/dashboard/media/
  app/api/admin/v1/content/
  app/api/admin/v1/media/
  lib/content/

docs/
  phase-4-cms-dam-design.md
  adr/022-content-catalog-boundary.md
  adr/023-dam-storage-port.md
  adr/024-content-publish-versioning.md
```

---

## 21. Tests required

### Domain unit tests

- Section schema validation (valid/invalid payloads)
- Locale fallback resolver
- Publish state machine transitions
- Broken asset reference validation
- SEO warning rules (missing title/description)

### Integration tests (PostgreSQL)

- RLS: tenant A cannot read tenant B content/assets
- Publish creates immutable version; draft edits don't affect published
- Manager scoped to property cannot edit other property content
- Asset upload confirm → variant rows created (mock processor)

### API tests

- Admin CRUD content draft per locale
- Publish / unpublish Storefront visibility flip
- Storefront `GET content` returns 404 when unpublished
- Storefront resolves assets with correct variant URLs
- ETag / cache headers on content endpoint

### DAM tests

- Folder tree uniqueness
- Tag attach/detach
- Alt text fallback across locales
- Archive asset → broken ref warning on next publish

### E2E (Playwright)

- Editor: add hero + gallery → publish → Storefront mock fetch shows sections
- Media upload flow (test bucket)
- Locale tab switch preserves drafts

### Performance

- Content response p95 < 200ms with 20 sections, assets resolved (warm cache)
- DAM list 500 assets p95 < 300ms

---

## 22. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| XSS via richtext | Security | Strict sanitization; allowlist tags; CSP docs for operators |
| Large JSONB sections | DB bloat | Limit sections count (e.g. 50); compress; paginate editor |
| Asset storage cost | OPEX | Variant limits; upload size cap (10MB default); archive policy |
| Catalog/CMS drift | Wrong page content | FK + admin warnings if property archived |
| Locale partial publish | Confusing UX | Clear badges per locale; fallback transparency in API |
| Processing queue backlog | Slow uploads | Async worker; status UI; retry |
| SEO over-promise | Operator expectations | Document JSON-LD as hints, not guarantee |
| AI hallucination | Brand/reputation | Human review; no auto-publish |
| Scope creep (full site builder) | Delay | Strict section v1 list; ADR for additions |
| Phase 3/4 coupling | Release blocking | Storefront content endpoint optional; catalog works without CMS |

---

## 23. Acceptance criteria

1. Operator creates draft content with ≥3 section types for a property in `en-US` and `el-GR`.
2. Operator uploads image to DAM, sets alt text, references in gallery section.
3. Image variants (`thumb`, `card`, `large`, `og`) available after processing.
4. Operator publishes content; Storefront API returns published sections for matching locale.
5. Unpublished / draft content not visible on Storefront (404).
6. SEO fields appear in Storefront response; OG image resolves to `og` variant.
7. Locale fallback returns `fallbackUsed: true` when requested locale missing.
8. Manager cannot edit content for unassigned property.
9. RLS integration tests prove zero cross-tenant reads.
10. `ContentPublished` event written to outbox on publish.
11. Broken asset reference surfaces admin warning before publish.
12. AI assist ports exist with stub adapter; no provider SDK in domain packages.
13. Catalog `Property` operational fields unchanged by CMS publish.
14. Audit log entries for publish and asset upload.

---

## 24. Implementation phases

### Phase 4A — Design & schemas (can start now)

- ADRs 022–024
- `@hcp/content-schemas` package (section + SEO Zod types)
- Domain model sketch + ports (`IObjectStorage`, `IImageProcessor`, `IContentAssistant`)
- OpenAPI additions for content endpoints (spec only)

**No DB, no routes.**

### Phase 4B — Persistence & admin API

- Prisma models + RLS migrations
- Repositories + use cases
- Admin content + media routes
- Presigned upload (local/S3 adapter)
- Domain unit + integration tests

**Depends on:** Phase 1 DB patterns; not blocked by Phase 2 commerce completion for CMS-only work.

### Phase 4C — Admin UI & processing

- Content editor UI (section forms, locale tabs)
- DAM library UI
- Image processing worker (variants)
- Preview + publish flow

### Phase 4D — Storefront integration

- `GET /properties/:slug/content` implementation
- Cache headers + sitemap/hreflang
- Widget optional content enrichment
- Playwright E2E

### Phase 4E — Polish & AI stubs

- Rollback (stretch)
- `IContentAssistant` stub + admin suggest buttons
- SEO validation strict mode
- Performance tuning

---

## 25. ADRs to author (Phase 4)

| ADR | Title |
|-----|-------|
| **ADR-022** | Content–catalog boundary (PropertyContent vs Property) |
| **ADR-023** | DAM object storage port (provider-agnostic, no DB blobs) |
| **ADR-024** | Content publish versioning (immutable published snapshots) |
| **ADR-025** | Multilingual content rows per locale |
| **ADR-026** | Section schema extensibility and sanitization |

---

## What can be designed now

- Full content model, section types, SEO DTOs
- DAM metadata model and variant strategy
- Storefront response contracts
- RLS policy design
- Admin workflow wireframes (textual)
- AI port interfaces
- Test plan and acceptance criteria
- ADRs 022–026 outlines

**No Supabase, Prisma migrations, or API implementation required.**

---

## What must wait

| Dependency | Blocks |
|------------|--------|
| Phase 3B Storefront API (optional for 4B) | Public content endpoint (4D) |
| Phase 1 production DB verification | RLS proof in staging |
| Object storage account / bucket | Real upload E2E |
| Image worker runtime | Variant generation in prod |
| Phase 2B catalog `published` alignment | Storefront catalog + content coherence |

---

## Recommended implementation order

```
Phase 4A (schemas + ADRs + domain ports) — now
    ↓
Phase 4B (DB + admin API + repos)
    ↓
Phase 4C (admin UI + image worker)
    ↓
Phase 4D (Storefront content endpoints + cache)
    ↓
Phase 4E (AI stubs + polish)
```

Phase 4 **must not** duplicate catalog or commerce logic. Content enriches presentation; booking remains Phase 2/3.

---

*End of Phase 4 design document.*
