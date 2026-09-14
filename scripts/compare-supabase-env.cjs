const fs = require("fs");
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

const expectHost = "aws-1-eu-north-1.pooler.supabase.com";
const expectRef = "eofmpszxlumqequjqcmp";
const expectUser = "postgres." + expectRef;

const env = loadEnv(path.join("packages", "database", ".env"));
const db = new URL(env.DATABASE_URL);
const dr = new URL(env.DIRECT_URL);

const dbUser = decodeURIComponent(db.username);
const drUser = decodeURIComponent(dr.username);
const dbRef = dbUser.includes(".") ? dbUser.split(".").slice(1).join(".") : "";
const drRef = drUser.includes(".") ? drUser.split(".").slice(1).join(".") : "";

console.log("DATABASE_URL.host", db.hostname);
console.log("DATABASE_URL.port", db.port);
console.log("DATABASE_URL.userFormatOk", dbUser === expectUser);
console.log("DATABASE_URL.ref", dbRef);
console.log("DIRECT_URL.host", dr.hostname);
console.log("DIRECT_URL.port", dr.port);
console.log("DIRECT_URL.userFormatOk", drUser === expectUser);
console.log("DIRECT_URL.ref", drRef);
console.log("refExactMatch", dbRef === expectRef && drRef === expectRef);
console.log("hostExactMatch", db.hostname === expectHost && dr.hostname === expectHost);
console.log("DATABASE_URL.port6543", db.port === "6543");
console.log("DIRECT_URL.port5432", dr.port === "5432");
console.log(
  "configMatchesPanel",
  db.hostname === expectHost &&
    dr.hostname === expectHost &&
    db.port === "6543" &&
    dr.port === "5432" &&
    dbUser === expectUser &&
    drUser === expectUser,
);
