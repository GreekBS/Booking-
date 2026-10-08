/**
 * Read-only: operator_copilot AiUsage summary from Production.
 * Supports legacy `http_attempts_N` and PR0 `rN|hN|tN|tmN|gmN` classifications.
 * ALLOW_TALOS_PRODUCTION_DB_MUTATION must remain UNSET.
 */
import { PrismaClient } from "@prisma/client";
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COPILOT_CLASSIFICATION_MAX,
  looksSensitiveClassification,
  parseCopilotClassification,
} from "./copilot-telemetry-decode";

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
    const summary = await prisma.$queryRawUnsafe<
      Array<{
        error_code: string | null;
        model: string;
        provider: string;
        success: boolean;
        n: number;
      }>
    >(
      `select error_code, model, provider, success, count(*)::int as n
       from ai_usage_records
       where operation = 'operator_copilot_turn'
       group by error_code, model, provider, success
       order by n desc`,
    );

    const recent = await prisma.$queryRawUnsafe<
      Array<{
        provider: string;
        model: string;
        operation: string;
        success: boolean;
        error_code: string | null;
        classification: string | null;
        latency_ms: number | null;
        input_tokens: number | null;
        output_tokens: number | null;
        created_at: Date;
      }>
    >(
      `select provider, model, operation, success, error_code, classification,
              latency_ms, input_tokens, output_tokens, created_at
       from ai_usage_records
       where operation in ('operator_copilot_turn','operator_copilot_round','operator_copilot_tool')
       order by created_at desc
       limit 40`,
    );

    const decoded = recent.map((row) => {
      const parsed = parseCopilotClassification(row.classification);
      const classLen = row.classification?.length ?? 0;
      return {
        operation: row.operation,
        success: row.success,
        error_code: row.error_code,
        model: row.model,
        latency_ms: row.latency_ms,
        input_tokens: row.input_tokens,
        output_tokens: row.output_tokens,
        classification: row.classification,
        classification_len: classLen,
        classification_ok: classLen <= COPILOT_CLASSIFICATION_MAX,
        parsed,
        sensitive_flag:
          looksSensitiveClassification(row.classification) ||
          looksSensitiveClassification(row.error_code),
        created_at: row.created_at,
      };
    });

    console.log(
      JSON.stringify(
        {
          summary,
          recent_decoded: decoded,
          checks: {
            classification_max: COPILOT_CLASSIFICATION_MAX,
            oversize_count: decoded.filter((r) => !r.classification_ok).length,
            sensitive_flag_count: decoded.filter((r) => r.sensitive_flag).length,
          },
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
