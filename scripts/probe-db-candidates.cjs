const fs = require("fs");
const net = require("net");
const { spawnSync } = require("child_process");
const path = require("path");

function loadEnv(file) {
  const text = fs.readFileSync(file, "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function withEncodedPassword(raw) {
  const u = new URL(raw);
  u.password = encodeURIComponent(decodeURIComponent(u.password));
  // URL setter may double-encode; build manually
  const user = u.username;
  const pass = encodeURIComponent(decodeURIComponent(new URL(raw).password));
  return `${u.protocol}//${user}:${pass}@${u.host}${u.pathname}${u.search}`;
}

async function tcp(host, port) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port, timeout: 3000 }, () => {
      s.destroy();
      resolve("OPEN");
    });
    s.on("error", (e) => resolve("FAIL:" + (e.code || e.message)));
    s.on("timeout", () => {
      s.destroy();
      resolve("TIMEOUT");
    });
  });
}

async function main() {
  const dbEnv = loadEnv(path.join("packages", "database", ".env"));
  const rootEnv = loadEnv(".env");
  console.log("tcp.local.5432", await tcp("127.0.0.1", 5432));
  console.log("tcp.supabase.5432", await tcp("aws-1-eu-north-1.pooler.supabase.com", 5432));
  console.log("tcp.supabase.6543", await tcp("aws-1-eu-north-1.pooler.supabase.com", 6543));

  const candidates = [];
  if (rootEnv.DATABASE_URL) {
    candidates.push(["root-local", rootEnv.DATABASE_URL, rootEnv.DIRECT_URL || rootEnv.DATABASE_URL]);
  }
  if (dbEnv.DATABASE_URL) {
    candidates.push(["supabase-as-is-tx", dbEnv.DATABASE_URL, dbEnv.DIRECT_URL || dbEnv.DATABASE_URL]);
    candidates.push([
      "supabase-encoded-tx",
      withEncodedPassword(dbEnv.DATABASE_URL),
      withEncodedPassword(dbEnv.DIRECT_URL || dbEnv.DATABASE_URL),
    ]);
    candidates.push([
      "supabase-as-is-direct",
      dbEnv.DIRECT_URL || dbEnv.DATABASE_URL,
      dbEnv.DIRECT_URL || dbEnv.DATABASE_URL,
    ]);
    candidates.push([
      "supabase-encoded-direct",
      withEncodedPassword(dbEnv.DIRECT_URL || dbEnv.DATABASE_URL),
      withEncodedPassword(dbEnv.DIRECT_URL || dbEnv.DATABASE_URL),
    ]);
  }

  const prismaBin = path.join(
    "node_modules",
    ".pnpm",
    "node_modules",
    "prisma",
    "build",
    "index.js",
  );
  // Use pnpm exec from packages/database via spawn env only
  for (const [label, databaseUrl, directUrl] of candidates) {
    const env = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: directUrl,
    };
    const result = spawnSync(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      ["exec", "prisma", "db", "execute", "--stdin"],
      {
        cwd: path.join(process.cwd(), "packages", "database"),
        env,
        input: "SELECT 1;",
        encoding: "utf8",
        timeout: 20000,
      },
    );
    const out = ((result.stdout || "") + "\n" + (result.stderr || "")).trim();
    const first = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(-5)
      .join(" | ");
    console.log(
      "PROBE",
      label,
      "exit=" + result.status,
      first.replace(/postgresql:\/\/[^@\s]+@/gi, "postgresql://***:***@"),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
