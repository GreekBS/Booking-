import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".ts") ? [path] : [];
  });
}

for (const file of walk("packages/domain/src")) {
  const content = readFileSync(file, "utf8");
  const updated = content.replace(/from "([^"]+)\.js"/g, 'from "$1"');
  if (updated !== content) {
    writeFileSync(file, updated);
  }
}
