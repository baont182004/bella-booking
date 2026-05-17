import { execFileSync } from "node:child_process";

const repoRoot = process.cwd();
const baseUrls = [
  "http://127.0.0.1:3001/health",
  "http://127.0.0.1:3002/health",
  "http://127.0.0.1:3003/health",
  "http://127.0.0.1:3004/health",
  "http://127.0.0.1:3005/health",
];

function run(command, args) {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForHealth(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      const body = await response.json();
      if (response.ok && body?.status === "healthy") {
        return;
      }
    } catch {
      // Ignore and retry until the deadline.
    }

    await sleep(1000);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

export default async function globalSetup() {
  run("docker", ["compose", "up", "-d"]);
  await Promise.all(baseUrls.map((url) => waitForHealth(url)));
  run(process.execPath, ["scripts/reset-demo-data.mjs"]);
  await Promise.all(baseUrls.map((url) => waitForHealth(url)));
}
