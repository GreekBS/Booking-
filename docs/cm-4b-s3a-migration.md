# CM-4b S3a migration notes

Migration: `20260717180000_cm4b_s3a_semantic_persistence`

## Schema changes

- Adds the closed PostgreSQL enum `ChannelFeedSemanticMode`
- Adds non-null `channel_connections.semantic_mode`, defaulting to `mixed_or_unknown_feed`
- Adds non-null `channel_connections.semantic_config_version`, defaulting to `1`
- Enforces `semantic_config_version >= 1`
- Widens `audit_logs.resource_id` from UUID to `VARCHAR(255)`
- Adds tenant-scoped `channel_semantic_transition_commands`

## Backfill semantics

Existing connections are assigned `mixed_or_unknown_feed` and semantic config
version `1` before non-null constraints are installed. This is migration
initialization, not an operator transition. It creates no audit record, command
receipt, cursor reset, Inbox mutation/replay, background job, Booking behavior,
or lifecycle activation.

No existing row can be backfilled to `reservation_feed`.

## Audit compatibility

`audit_logs.resource_id` has no foreign key and no dedicated index. Existing UUID
values are converted losslessly with `resource_id::text`; the Prisma/domain API
already represents this field as `string | null`. Existing UUID-based audit
writers remain compatible, while ChannelConnection IDs up to 255 characters can
now be recorded directly.

This type change is forward-compatible but not safely reversible after a
non-UUID resource ID is inserted. Application rollback must retain the widened
column.

## Command receipt table

`channel_semantic_transition_commands` is a provider-neutral idempotency receipt,
separate from AuditLog. S3a creates schema and tenant RLS only; it does not claim,
execute, retry, or commit commands.

The composite identity is `(tenant_id, operation, command_id)`. The stored
fingerprint is constrained to a lowercase SHA-256 hexadecimal value. Semantic
version fields must be positive when present.

## Deployment and verification

1. Apply the migration before deploying code generated from the updated Prisma schema.
2. Run `prisma generate`.
3. Verify every connection has mixed mode/version `1` unless created explicitly after migration.
4. Verify no connection has `reservation_feed` as a result of migration.
5. Verify command-table RLS and the tenant policy are enabled.
6. Keep `SetChannelConnectionSemanticModeUseCase` absent from production DI.

Durable cursor persistence and all semantic transition behavior remain deferred
to later approved S3 slices.
