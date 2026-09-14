const { PrismaClient } = require("@prisma/client");

async function main() {
  const label = process.argv[2] || "unnamed";
  console.log(
    "ENV_URL_HOST",
    (() => {
      try {
        return new URL(process.env.DATABASE_URL).host;
      } catch {
        return "unparseable";
      }
    })(),
  );
  let p;
  try {
    p = new PrismaClient({
      datasources: {
        db: { url: process.env.DATABASE_URL },
      },
    });
  } catch (e) {
    console.log("CLIENT_INIT_FAIL", label, e && e.message);
    process.exit(1);
  }
  try {
    await p.$connect();
    const rows = await p.$queryRawUnsafe("SELECT 1::int AS ok");
    console.log("OK", label, JSON.stringify(rows));
  } catch (e) {
    console.log("FAIL", label);
    console.log("code", e.code || "none");
    console.log(
      "message",
      String(e.message || e)
        .split("\n")
        .slice(0, 3)
        .join(" | ")
        .replace(/postgresql:\/\/[^@\s]+@/gi, "postgresql://***:***@"),
    );
    process.exitCode = 1;
  } finally {
    try {
      await p.$disconnect();
    } catch {}
  }
}

main();
