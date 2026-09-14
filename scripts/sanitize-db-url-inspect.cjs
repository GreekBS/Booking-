const fs = require("fs");

function loadEnv(file) {
  if (!fs.existsSync(file)) return null;
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

function sanitize(label, raw) {
  console.log("--- " + label + " ---");
  if (!raw) {
    console.log("ABSENT");
    return;
  }
  let u;
  try {
    u = new URL(raw);
  } catch (e) {
    console.log("PARSE_ERROR:", e.message);
    console.log("length:", raw.length);
    console.log("hasWhitespace:", /\s/.test(raw));
    return;
  }
  const user = decodeURIComponent(u.username || "");
  const pass = decodeURIComponent(u.password || "");
  const host = u.hostname;
  let mode = "other";
  if (host.includes("pooler.supabase.com")) {
    if (u.port === "6543" || raw.includes("pgbouncer=true")) mode = "transaction_pooler";
    else if (u.port === "5432") mode = "session_pooler";
    else mode = "supabase_pooler_other_port";
  } else if (host === "localhost" || host === "127.0.0.1") {
    mode = "local_direct";
  } else if (host.includes("supabase.co") && !host.includes("pooler")) {
    mode = "supabase_direct";
  }
  console.log("protocol:", u.protocol.replace(":", ""));
  console.log("hostClass:", host.includes("supabase") ? "supabase-pooler-or-api" : host);
  console.log("port:", u.port || "(default)");
  console.log("database:", (u.pathname || "/").replace(/^\//, "") || "(empty)");
  console.log(
    "usernameFormat:",
    user.includes(".") ? "role.projectref" : user ? "plain" : "empty",
  );
  console.log("passwordPresent:", pass.length > 0);
  console.log("passwordSpecialChars:", /[^A-Za-z0-9]/.test(pass));
  console.log("passwordUrlEncodedInRaw:", /:%[0-9A-Fa-f]{2}/.test(raw.split("@")[0] || ""));
  console.log("queryKeys:", [...u.searchParams.keys()].join(",") || "none");
  console.log("modeGuess:", mode);
}

console.log("shell.DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "UNSET");
console.log("shell.DIRECT_URL:", process.env.DIRECT_URL ? "SET" : "UNSET");
sanitize("root/.env DATABASE_URL", loadEnv(".env")?.DATABASE_URL);
sanitize("root/.env DIRECT_URL", loadEnv(".env")?.DIRECT_URL);
sanitize("packages/database/.env DATABASE_URL", loadEnv("packages/database/.env")?.DATABASE_URL);
sanitize("packages/database/.env DIRECT_URL", loadEnv("packages/database/.env")?.DIRECT_URL);
