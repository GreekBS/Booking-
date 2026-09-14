# P1-S7c Phase 1 — Connection-level inventory apply fence

Status: **Phase 1 implementation** (safety foundation).  
**Not** controlled-pilot activated. **Not** production cron. **Not** real-feed verified.

## What Phase 1 delivers

- `channel_connections.inventory_apply_enabled` (default `false`)
- Global **AND** connection mutation gate
- Polling continues while connection apply OFF (cursor-only / warm observation)
- TX2 / enable / disable linearized on connection `FOR UPDATE`
- Enable supersedes stale pending (`cursorVersion < committed cursor`); retains current-cursor pending
- Operator enable/disable APIs + audits
- Health: `inventoryApplyGloballyEnabled`, `inventoryApplyForConnection`, `inventoryApplyEffective`, `pilotEligible`, `activeChannelImportCount`

## Enable / pilotEligible refinement (locked)

Architecture refinement discovered during implementation — resolved and locked:

```text
While connection apply is OFF, pending_reconciliation_without_runnable_job
is NOT automatically an enable blocker when lack of runnable work is the
intentional Sweep skip under the apply fence.

Dead-letter / cancelled+pending recovery states remain hard blockers.
Enable is not a ForceRedrive substitute.

Health.pilotEligible and POST inventory-apply/enable share one classification helper.
```

## Operator workflow (when pilot is later approved)

1. Ensure global `CHANNELS_INVENTORY_APPLY_ENABLED=true` (environment)
2. Confirm `pilotEligible=true` via health
3. `POST .../inventory-apply/enable` with `expectedSemanticConfigVersion`
4. Optional manual poll for freshness (current-cursor pending may already apply)
5. Rollback: `POST .../inventory-apply/disable` then `POST .../inventory/deactivate`

## Explicit non-claims

```text
P1-S7c Phase 1 code complete ≠ controlled pilot activated
Production cron activated: NO (Phase 1)
Real feed connected: NO
Global production apply enabled: NO (operator decision)
Real connection apply enabled: NO (operator decision)
```

## Remaining activation work (after Phase 1 closure)

- real-feed read-only observation
- controlled manual apply
- external cron activation
- N=3 autonomous cycles
- real external add/remove
- rollback drill against pilot
- final GO / NO-GO
