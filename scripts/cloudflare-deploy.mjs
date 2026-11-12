import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { configureToolEnvironment } from "./tool-environment.mjs";

configureToolEnvironment(process.cwd());
const command = process.argv[2];
if (!["check", "migrate", "deploy"].includes(command)) throw new Error("Expected check, migrate, or deploy.");
const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
if (config.vars?.AUTH_MODE !== "access") throw new Error("Standalone deployment requires Cloudflare Access authentication.");
if (!config.d1_databases?.some(db => db.binding === "DB" && /^[a-f0-9-]{36}$/.test(db.database_id) && !db.database_id.startsWith("00000000-"))) {
  throw new Error("Create the Cloudflare D1 database and put its database_id in wrangler.jsonc first.");
}
if (!config.r2_buckets?.some(bucket => bucket.binding === "BUCKET" && bucket.bucket_name)) throw new Error("Configure the BUCKET R2 binding first.");
function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const wrangler = "./node_modules/wrangler/bin/wrangler.js";
if (command === "migrate") run([wrangler, "d1", "migrations", "apply", "DB", "--remote", "--config", "wrangler.jsonc"]);
if (command === "deploy") {
  run(["./scripts/run-framework.mjs", "build"]);
  run([wrangler, "d1", "migrations", "apply", "DB", "--remote", "--config", "wrangler.jsonc"]);
  run([wrangler, "deploy", "--config", "dist/server/wrangler.json"]);
}
if (command === "check") console.log("Resource configuration is ready. Cloudflare login, R2 activation, Access policy, and runtime secrets must also be configured before inviting testers.");
