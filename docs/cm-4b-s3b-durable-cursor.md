# CM-4b S3b durable cursor notes

Migration: `20260717190000_cm4b_s3b_durable_cursor`

## Boundary

S3b is the approved narrow S4 pull-forward. It provides durable,
provider-neutral cursor persistence solely for:

- future atomic semantic-transition reset;
- repository-level rejection of cursor commits from a stale semantic epoch.

It does not enable production polling or semantic transitions.

## Persistence

`channel_poll_cursors` stores:

- composite `(tenant_id, connection_id)` identity;
- opaque text payload;
- positive cursor version;
- positive semantic config version;
- database-maintained update timestamp.

Its composite foreign key references `channel_connections` and cascades on
connection deletion. PostgreSQL RLS uses `app.current_tenant`, matching existing
channel tables. The migration creates no cursor rows and mutates no existing
connection, semantic, audit, command, Inbox, Booking, or job data.

## Commit and reset contract

Create/update transactions always lock ChannelConnection before
ChannelPollCursor. The connection semantic version must equal the version
observed by the caller at poll start.

- Missing row + expected cursor version `0` creates version `1`.
- Existing row requires both cursor-version and semantic-version matches.
- Successful update increments cursor version exactly once.
- Stale versions return a concurrency conflict.
- Delete is the tenant-scoped, idempotent reset mechanism.

The repository can own a Prisma transaction or participate in an existing
transaction. Tenant context is set on that transaction client.

## Opaque payload

The payload is preserved exactly as a string. S3b defines no ETag, offset,
watermark, URL, HTTP, iCal, or provider-specific representation.

## Operational status

Production poll DI, scheduler registration, provider fetching, and iCal remain
absent. Future polling must pass the semantic config version observed at poll
start into cursor commit. Semantic management cannot be enabled alongside any
production poll path that commits without this guard.

S3d atomic mode change, cursor reset, audit, and command-receipt commit is
implemented in the later S3d slice; S3b only supplies the durable cursor
primitives that transaction uses.
