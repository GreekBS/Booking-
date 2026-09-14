const { PrismaClient } = require("@prisma/client");

async function main() {
  const p = new PrismaClient();
  try {
    const enumVals = await p.$queryRawUnsafe(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'CalendarBlockType'
      ORDER BY e.enumsortorder
    `);
    console.log(
      "CalendarBlockType",
      enumVals.map((r) => r.enumlabel).join(","),
    );
    console.log(
      "has_channel_import",
      enumVals.some((r) => r.enumlabel === "channel_import"),
    );

    const exclude = await p.$queryRawUnsafe(`
      SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conname = 'unit_calendar_no_overlap'
    `);
    console.log("exclude_def", exclude[0]?.def || "MISSING");
    const def = String(exclude[0]?.def || "");
    console.log("exclude_has_channel_import", def.includes("channel_import"));
    console.log("exclude_has_hold", def.includes("'hold'"));
    console.log("exclude_has_booking", def.includes("'booking'"));

    const cols = await p.$queryRawUnsafe(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'channel_inventory_reconciliations'
      ORDER BY ordinal_position
    `);
    console.log(
      "recon_cols",
      cols.map((c) => c.column_name).join(","),
    );

    const pk = await p.$queryRawUnsafe(`
      SELECT a.attname
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'channel_inventory_reconciliations'::regclass
        AND i.indisprimary
      ORDER BY a.attnum
    `);
    console.log(
      "recon_pk",
      pk.map((r) => r.attname).join(","),
    );

    const idx = await p.$queryRawUnsafe(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'channel_inventory_reconciliations'
      ORDER BY indexname
    `);
    console.log(
      "recon_indexes",
      idx.map((r) => r.indexname).join("|"),
    );

    const rls = await p.$queryRawUnsafe(`
      SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
      FROM pg_class c
      WHERE c.relname = 'channel_inventory_reconciliations'
    `);
    console.log("recon_rls", JSON.stringify(rls[0] || null));

    const delivery = await p.$queryRawUnsafe(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'outbox_events' AND column_name = 'delivery_key'
    `);
    console.log("delivery_key", JSON.stringify(delivery[0] || null));

    const uq = await p.$queryRawUnsafe(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'outbox_events'
        AND indexdef ILIKE '%delivery_key%'
    `);
    console.log(
      "delivery_key_indexes",
      uq.map((r) => r.indexdef).join(" || "),
    );
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(String(e.message || e).split("\n")[0]);
  process.exit(1);
});
