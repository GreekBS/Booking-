/**
 * Upsert the central Talos PlatformMessagingConnection for Meta Cloud API test/prod.
 *
 * Reads the access token ONLY from env — never invents or prints secrets.
 *
 * Usage (from packages/database):
 *   pnpm exec tsx scripts/run-messaging-platform-whatsapp-connection.ts
 *
 * Required env:
 *   MESSAGING_WHATSAPP_ACCESS_TOKEN   (or META_WHATSAPP_ACCESS_TOKEN)
 *   MESSAGING_CREDENTIALS_MASTER_KEY  (or CHANNELS_CREDENTIALS_MASTER_KEY)
 *
 * Optional env (defaults = Meta test configuration supplied for Talos E2E):
 *   MESSAGING_WHATSAPP_PHONE_NUMBER_ID=1328257430372445
 *   MESSAGING_WHATSAPP_DISPLAY_NUMBER=+15551589328
 *   MESSAGING_WHATSAPP_WABA_ID=28567329549617803
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigurePlatformWhatsAppConnectionUseCase } from "@hcp/domain";

const root = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(root, "../.env") });
loadEnv({ path: resolve(root, "../../.env") });
loadEnv({ path: resolve(root, "../../apps/web/.env") });
loadEnv({ path: resolve(root, "../../apps/web/.env.local") });

const DEFAULT_PHONE_NUMBER_ID = "1328257430372445";
const DEFAULT_DISPLAY = "+15551589328";
const DEFAULT_WABA = "28567329549617803";

async function main(): Promise<void> {
  const {
    assertNotTalosProductionDatabase,
    isTalosProductionDatabaseUrl,
    PrismaPlatformMessagingConnectionRepository,
    PrismaMessagingSecretVault,
    UuidIdGenerator,
  } = await import("../src/index.js");

  const dbUrl = process.env.RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
  if (
    isTalosProductionDatabaseUrl(dbUrl) ||
    isTalosProductionDatabaseUrl(process.env.DATABASE_URL)
  ) {
    if (process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION?.trim() !== "true") {
      assertNotTalosProductionDatabase(dbUrl, "platform-whatsapp-connection");
    }
  }

  const accessToken =
    process.env.MESSAGING_WHATSAPP_ACCESS_TOKEN?.trim() ||
    process.env.META_WHATSAPP_ACCESS_TOKEN?.trim() ||
    "";

  if (!accessToken) {
    console.error(
      JSON.stringify(
        {
          blocked: true,
          reason: "access_token_env_missing",
          requiredEnv: [
            "MESSAGING_WHATSAPP_ACCESS_TOKEN",
            "(or META_WHATSAPP_ACCESS_TOKEN)",
          ],
          alsoRequired: [
            "MESSAGING_CREDENTIALS_MASTER_KEY",
            "(or CHANNELS_CREDENTIALS_MASTER_KEY)",
          ],
          hint: "Set the Meta permanent/system-user access token in env only — never paste into chat or source.",
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const masterKey =
    process.env.MESSAGING_CREDENTIALS_MASTER_KEY?.trim() ||
    process.env.CHANNELS_CREDENTIALS_MASTER_KEY?.trim() ||
    "";
  if (!masterKey) {
    console.error(
      JSON.stringify(
        {
          blocked: true,
          reason: "credentials_master_key_missing",
          requiredEnv: [
            "MESSAGING_CREDENTIALS_MASTER_KEY",
            "(or CHANNELS_CREDENTIALS_MASTER_KEY)",
          ],
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const phoneNumberId =
    process.env.MESSAGING_WHATSAPP_PHONE_NUMBER_ID?.trim() ||
    DEFAULT_PHONE_NUMBER_ID;
  const displayPhoneNumber =
    process.env.MESSAGING_WHATSAPP_DISPLAY_NUMBER?.trim() || DEFAULT_DISPLAY;
  const wabaId =
    process.env.MESSAGING_WHATSAPP_WABA_ID?.trim() || DEFAULT_WABA;

  const useCase = new ConfigurePlatformWhatsAppConnectionUseCase(
    new PrismaPlatformMessagingConnectionRepository(),
    new PrismaMessagingSecretVault(),
    new UuidIdGenerator(),
  );

  const result = await useCase.execute({
    phoneNumberId,
    displayPhoneNumber,
    accessToken,
    whatsappBusinessAccountId: wabaId,
  });

  if (result.isFailure) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: result.getError().message,
          // Never echo access token / secrets.
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const connection = result.getValue();
  console.log(
    JSON.stringify(
      {
        ok: true,
        id: connection.id,
        channel: connection.channel,
        status: connection.status,
        phoneNumberId: connection.phoneNumberId,
        displayPhoneNumber: connection.displayPhoneNumber,
        externalAccountId: connection.externalAccountId,
        hasCredentialRef: Boolean(connection.credentialRef),
        // credentialRef value is an opaque vault pointer — safe to confirm presence only.
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
