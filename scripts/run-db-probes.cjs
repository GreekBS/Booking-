const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

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

function encodeUrl(raw) {
  const u = new URL(raw);
  const pass = encodeURIComponent(u.password);
  return `${u.protocol}//${u.username}:${pass}@${u.host}${u.pathname}${u.search}`;
}

function redact(s) {
  return String(s).replace(/postgresql:\/\/[^@\s]+@/gi, "postgresql://***:***@");
}

const root = path.resolve(__dirname, "..");
const dbDir = path.join(root, "packages", "database");
const rootEnv = loadEnv(path.join(root, ".env"));
const dbEnv = loadEnv(path.join(dbDir, ".env"));

const candidates = [
  ["root-local", rootEnv.DATABASE_URL, rootEnv.DATABASE_URL],
  ["supabase-tx", dbEnv.DATABASE_URL, dbEnv.DIRECT_URL],
  ["supabase-direct", dbEnv.DIRECT_URL, dbEnv.DIRECT_URL],
  ["supabase-tx-enc", encodeUrl(dbEnv.DATABASE_URL), encodeUrl(dbEnv.DIRECT_URL)],
  ["supabase-direct-enc", encodeUrl(dbEnv.DIRECT_URL), encodeUrl(dbEnv.DIRECT_URL)],
];

for (const [label, databaseUrl, directUrl] of candidates) {
  const env = { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: directUrl };
  const r = spawnSync(process.execPath, ["scripts/probe-connect.cjs", label], {
    cwd: dbDir,
    env,
    encoding: "utf8",
    timeout: 25000,
  });
  const combined = redact((r.stdout || "") + (r.stderr || ""));
  console.log("====", label, "exit", r.status, "====");
  console.log(combined.trim() || "(no output)");
}
