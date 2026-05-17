import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const envPath = path.join(repoRoot, ".env");

function loadRootEnv() {
  if (!existsSync(envPath)) {
    return;
  }

  const contents = readFileSync(envPath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    process.env[key] = value;
  }
}

loadRootEnv();

execFileSync(process.execPath, [path.join("services", "user-service", "ensure-admin.mjs")], {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
});
