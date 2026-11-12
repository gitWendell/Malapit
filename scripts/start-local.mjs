import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import "./sites-env.mjs";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--port" || !/^\d{4,5}$/.test(args[1]))) throw new Error("Usage: npm start -- --port 5188");
const config = JSON.parse(readFileSync("dist/server/wrangler.json", "utf8"));
// This separate, ignored config is used only with --local on loopback.
// No R2 resource or subscription is needed; production has no R2 binding.
writeFileSync("dist/server/wrangler.local.json", JSON.stringify({ ...config,
  vars: { AUTH_MODE: "local", ADMIN_USER_IDS: "local_seedy" },
  r2_buckets: [{ binding: "LOCAL_PHOTOS", bucket_name: "malapit-dev-photos" }],
}, null, 2));
const child = spawn(process.execPath, ["./node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.local.json", "--local", "--persist-to", ".wrangler/state", "--ip", "127.0.0.1", "--inspector-port", "0", "--port", args[1] ?? "5188", "--log-level", "warn"], { stdio: "inherit" });
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => { process.exitCode = code ?? 1; });
