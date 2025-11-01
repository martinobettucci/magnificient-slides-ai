#!/usr/bin/env node

import { randomBytes } from 'crypto';
import { chmodSync, existsSync, writeFileSync } from 'fs';
import { dirname, resolve, relative } from 'path';
import { fileURLToPath } from 'url';

const args = new Set(process.argv.slice(2));
const force = args.has('--force') || process.env.npm_config_force === 'true';

const base64Url = (buffer) =>
  Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const toRelative = (target, start) =>
  relative(start, target).split('\\').join('/');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const signingKeysPath = resolve(projectRoot, 'signing_keys.json');

if (existsSync(signingKeysPath) && !force) {
  console.error(
    `${toRelative(signingKeysPath, projectRoot)} already exists. Re-run with --force to overwrite.`,
  );
  process.exit(1);
}

const rawKey = randomBytes(32);
const secret = base64Url(rawKey);
const kidSuffix = base64Url(randomBytes(6));
const kid = `local-${Date.now().toString(36)}-${kidSuffix}`;
const jwkPayload = {
  keys: [
    {
      kid,
      use: 'sig',
      kty: 'oct',
      alg: 'HS256',
      k: base64Url(rawKey),
    },
  ],
};

writeFileSync(signingKeysPath, `${JSON.stringify(jwkPayload, null, 2)}\n`, { mode: 0o600 });

try {
  chmodSync(signingKeysPath, 0o600);
} catch {
  // Ignore platforms that do not support chmod (e.g. Windows)
}

console.log(`Saved signing key to ${toRelative(signingKeysPath, projectRoot)} (kid: ${kid}).`);
console.log();
console.log('Use this secret for JWT verification:');
console.log(`JWT_SECRET=${secret}`);
console.log();
console.log(
  'Add the secret above to supabase/.env (and optionally set VERIFY_JWT=true) before starting Supabase.',
);
