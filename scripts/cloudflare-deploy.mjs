import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { configureToolEnvironment } from "./tool-environment.mjs";

configureToolEnvironment(process.cwd());
const command = process.argv[2];
if (!["check", "migrate", "deploy"].includes(command)) throw new Error("Expected check, migrate, or deploy.");
const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
if (config.vars?.AUTH_MODE !== "supabase") throw new Error("Standalone deployment requires Supabase authentication.");
if (!config.d1_databases?.some(db => db.binding === "DB" && /^[a-f0-9-]{36}$/.test(db.database_id) && !db.database_id.startsWith("00000000-"))) {
  throw new Error("Create the Cloudflare D1 database and put its database_id in wrangler.jsonc first.");
}
if (config.r2_buckets?.length) throw new Error("The free pilot must not deploy an R2 binding. Photos use Supabase Free.");
if (config.vars?.ADMIN_USER_IDS?.includes("local_seedy")) throw new Error("Do not deploy a fictional local administrator.");
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
if (command === "check") console.log("Source configuration is ready: Supabase mode, D1, and no R2 binding. Confirm both providers remain on Free plans, configure Supabase Google sign-in/private storage and Worker secrets, then verify the deployed app before inviting testers.");
