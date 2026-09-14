# CM-4b S3c repository semantic persistence notes

## Boundary

S3c makes ChannelConnection semantic fields durable through the repository and
establishes write boundaries. It does not implement semantic transitions,
command receipt execution, activation approval, cursor-reset orchestration, or
production polling.

## Strict hydration

Repository reads hydrate:

- lifecycle fields
- provider identity
- `semanticMode`
- `semanticConfigVersion`

Hydration uses `ChannelConnection.reconstitute`. Invalid semantic values fail.
Repository code no longer calls `hydrateFromLegacyPersistence`.

## Write boundaries

| Method | Writes semantic columns? | Notes |
|---|---|---|
| `create` | Yes, only mixed / version 1 | Sole insert path |
| `saveNonSemanticChanges` | No | Omits provider and semantic columns |
| `persistSemanticState` | Yes, under CAS | Only semantic mutation path |
| `activateWithExpectedSemanticVersion` | No | Status CAS + semantic-version CAS |
| `resumeWithExpectedSemanticVersion` | No | Status CAS + semantic-version CAS |

No generic last-write-wins save remains on the connection repository.

## Semantic CAS

`persistSemanticState` and lifecycle helpers require an observed/expected
semantic configuration version. A zero-row update is then classified by an
existence check in the same transaction: missing aggregate → `NotFoundError`;
present but predicate mismatch → `ConflictError`.

## Provider immutability

Provider is written only on `create`. Later non-semantic updates never change it.

## Deferred

S3d owns the atomic transition transaction that combines semantic CAS, cursor
reset, audit, and command receipt commit. S3e owns unskippable activation
approval. Production semantic management remains unavailable.
