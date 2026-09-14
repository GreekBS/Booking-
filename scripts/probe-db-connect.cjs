const { PrismaClient } = require("@prisma/client");

async function main() {
  const p = new PrismaClient();
  try {
    const rows = await p.$queryRawUnsafe(
      "SELECT current_database() AS db, current_user AS usr",
    );
    console.log("CONNECT_OK", JSON.stringify(rows));
  } catch (e) {
    console.log("CONNECT_FAIL", e.code || "", String(e.message).split("\n")[0]);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
}

main();
