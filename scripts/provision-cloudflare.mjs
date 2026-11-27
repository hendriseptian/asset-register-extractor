import { spawnSync } from "node:child_process";
import { writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerDir = path.join(root, "worker");
const generatedConfig = path.join(workerDir, "wrangler.generated.toml");

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
const geminiKey = process.env.GEMINI_API_KEY?.trim();
const repoOwner = (process.env.GITHUB_REPOSITORY_OWNER || "mechasset-user").toLowerCase();
const workerName = (process.env.MECHASSET_WORKER_NAME || `mechasset-${repoOwner}`)
  .toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 55);
const databaseName = (process.env.MECHASSET_D1_NAME || "mechasset-db").trim();

if (!accountId || !apiToken || !geminiKey) {
  throw new Error("Required GitHub Actions secrets are missing: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, GEMINI_API_KEY.");
}
if (!/^[a-zA-Z0-9_-]{1,63}$/.test(databaseName)) {
  throw new Error("MECHASSET_D1_NAME must be 1-63 characters and contain only letters, numbers, underscores, or hyphens.");
}
if (!workerName) throw new Error("Could not create a valid Worker name.");

async function cloudflare(pathname, options = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const messages = (payload.errors || []).map(error => error.message).filter(Boolean).join("; ");
    throw new Error(`Cloudflare API ${response.status}: ${messages || response.statusText}`);
  }
  return payload;
}

function runWrangler(args, input) {
  const result = spawnSync("npx", ["--yes", "wrangler@4", ...args, "--config", "wrangler.generated.toml"], {
    cwd: workerDir,
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: apiToken },
    input,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Wrangler failed: wrangler ${args.join(" ")}`);
}

console.log("MECHASSET automatic Cloudflare provisioning");
console.log(`Cloudflare account: ${accountId}`);
console.log(`Worker: ${workerName}`);
console.log(`D1 database: ${databaseName}`);

const list = await cloudflare(`/accounts/${accountId}/d1/database?per_page=100`);
const existing = (list.result || []).find(database => database.name === databaseName);
let databaseId = existing?.uuid;

if (databaseId) {
  console.log("Found existing D1 database; reusing it (no duplicate database will be created).");
} else {
  console.log("Creating a new D1 database...");
  const created = await cloudflare(`/accounts/${accountId}/d1/database`, {
    method: "POST",
    body: JSON.stringify({ name: databaseName })
  });
  databaseId = created.result?.uuid;
  if (!databaseId) throw new Error("Cloudflare created a response without a D1 database UUID.");
  console.log("D1 database created.");
}

const config = `name = "${workerName}"
main = "src/index.js"
compatibility_date = "2026-11-17"

[[d1_databases]]
binding = "DB"
database_name = "${databaseName}"
database_id = "${databaseId}"

[vars]
GEMINI_MODEL = "gemini-3.5-flash-lite"
`;

try {
  await writeFile(generatedConfig, config, "utf8");
  console.log("Applying all repository D1 migrations (PSV, BVV, and PV)...");
  runWrangler(["d1", "migrations", "apply", databaseName, "--remote"]);
  console.log("Saving Gemini API key as a Cloudflare Worker secret...");
  runWrangler(["secret", "put", "GEMINI_API_KEY"], `${geminiKey}\n`);
  console.log("Deploying MECHASSET Worker...");
  runWrangler(["deploy"]);
  console.log("MECHASSET backend provisioning completed.");
  try {
    const subdomainResponse = await cloudflare(`/accounts/${accountId}/workers/subdomain`);
    const subdomain = subdomainResponse.result?.subdomain;
    if (subdomain) console.log(`Worker URL: https://${workerName}.${subdomain}.workers.dev`);
    else console.log("Worker deployed. Find its workers.dev URL in Cloudflare > Workers & Pages.");
  } catch {
    console.log("Worker deployed. Find its workers.dev URL in Cloudflare > Workers & Pages.");
  }
} finally {
  await rm(generatedConfig, { force: true });
}
