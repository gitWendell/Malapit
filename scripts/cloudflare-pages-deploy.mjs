import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { configureToolEnvironment } from './tool-environment.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
configureToolEnvironment(root);
const source = join(root, 'deploy/pages');
const config = JSON.parse(readFileSync(join(source, 'wrangler.jsonc'), 'utf8'));
if (config.name !== 'malapit' || config.env?.production?.services?.length !== 1 ||
    config.env.production.services[0].service !== 'malapit' ||
    config.env.production.services[0].binding !== 'MALAPIT' || config.env?.preview?.services?.length !== 0) {
  throw new Error('Pages must use the existing Malapit service in production only.');
}

// Keep Pages outside Vinext's generated Worker-config search tree. This avoids
// changing or removing the main app's .wrangler/deploy/config.json file.
const staging = mkdtempSync(join(tmpdir(), 'malapit-pages-'));
let status = 1;
try {
  cpSync(join(source, 'public'), join(staging, 'public'), { recursive: true });
  writeFileSync(join(staging, 'wrangler.jsonc'), JSON.stringify(config));
  writeFileSync(join(staging, 'public/_worker.js'),
    `export { default } from ${JSON.stringify(join(root, 'worker/pages-address.mjs'))};\n`);
  const result = spawnSync(process.execPath, [
    join(root, 'node_modules/wrangler/bin/wrangler.js'), 'pages', 'deploy',
    '--cwd', staging, '--project-name', config.name, '--branch', 'main',
    '--commit-dirty=true',
  ], { stdio: 'inherit', env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: '7c9c1df86d0610e2abb3f992f60163b3' } });
  if (result.error) throw result.error;
  status = result.status ?? 1;
} finally {
  rmSync(staging, { recursive: true, force: true });
}
process.exitCode = status;
