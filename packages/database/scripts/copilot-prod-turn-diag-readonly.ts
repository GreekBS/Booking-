/**
 * Read-only: latest operator_copilot turns + rounds/tools + message previews.
 * Supports legacy `http_attempts_N` and PR0 `rN|hN|tN|tmN|gmN` / `rN|hN`.
 * No mutation. ALLOW_TALOS_PRODUCTION_DB_MUTATION must remain UNSET.
 */
import { PrismaClient } from "@prisma/client";
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCopilotClassification } from "./copilot-telemetry-decode";

const root = dirname(fileURLToPath(import.meta.url));
delete process.env.DATABASE_URL;
delete process.env.DIRECT_URL;
loadEnv({ path: resolve(root, "../../../apps/web/.env.local"), override: true });

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("eofmpszxlumqequjqcmp") && !url.includes("supabase")) {
    console.error(JSON.stringify({ stop: true, reason: "not_prod" }));
    process.exit(2);
  }
  if (process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION !== undefined) {
    console.error(JSON.stringify({ stop: true, reason: "ALLOW_must_be_UNSET" }));
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    const turns = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        provider: string;
        model: string;
        success: boolean;
        error_code: string | null;
        classification: string | null;
        latency_ms: number | null;
        input_tokens: number | null;
        output_tokens: number | null;
        property_id: string | null;
        created_at: Date;
      }>
    >(
      `select id, provider, model, success, error_code, classification, latency_ms,
              input_tokens, output_tokens, property_id, created_at
       from ai_usage_records
       where operation = 'operator_copilot_turn'
       order by created_at desc
       limit 8`,
    );

    const rounds = await prisma.$queryRawUnsafe<
      Array<{
        provider: string;
        model: string;
        success: boolean;
        error_code: string | null;
        classification: string | null;
        latency_ms: number | null;
        input_tokens: number | null;
        output_tokens: number | null;
        created_at: Date;
      }>
    >(
      `select provider, model, success, error_code, classification, latency_ms,
              input_tokens, output_tokens, created_at
       from ai_usage_records
       where operation = 'operator_copilot_round'
       order by created_at desc
       limit 20`,
    );

    const tools = await prisma.$queryRawUnsafe<
      Array<{
        provider: string;
        model: string;
        success: boolean;
        error_code: string | null;
        classification: string | null;
        latency_ms: number | null;
        created_at: Date;
      }>
    >(
      `select provider, model, success, error_code, classification, latency_ms, created_at
       from ai_usage_records
       where operation = 'operator_copilot_tool'
       order by created_at desc
       limit 20`,
    );

    const messages = await prisma.$queryRawUnsafe<
      Array<{
        role: string;
        tool_name: string | null;
        content_preview: string;
        created_at: Date;
        conversation_id: string;
      }>
    >(
      `select role, tool_name,
              left(content, 160) as content_preview,
              created_at, conversation_id
       from copilot_messages
       order by created_at desc
       limit 20`,
    );

    console.log(
      JSON.stringify(
        {
          turns: turns.map((t) => ({
            ...t,
            parsed_classification: parseCopilotClassification(t.classification),
            classification_len: t.classification?.length ?? 0,
          })),
          rounds: rounds.map((r) => ({
            ...r,
            parsed_classification: parseCopilotClassification(r.classification),
            classification_len: r.classification?.length ?? 0,
          })),
          tools,
          messages,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
