'use strict';

/**
 * generate-license-keys.js
 * Run once by the seller to create an RSA key pair.
 *
 * Outputs:
 *   license-keys/public.pem   -> embed this in the app (src/lib/license-public-key.ts)
 *   license-keys/private.pem  -> KEEP SECRET. Never commit to git.
 *
 * Usage: node scripts/generate-license-keys.js
 */

const crypto = require('crypto');
const fsp = require('fs/promises');
const path = require('path');

async function main() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: '' },
  });

  const dir = path.resolve(__dirname, '..', 'license-keys');
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'public.pem'), publicKey);
  await fsp.writeFile(path.join(dir, 'private.pem'), privateKey);

  console.log('================================================');
  console.log(' License keys generated');
  console.log('================================================');
  console.log('Public key :', path.join(dir, 'public.pem'));
  console.log('Private key:', path.join(dir, 'private.pem'));
  console.log('');
  console.log('Next steps:');
  console.log('  1. Copy the contents of public.pem into src/lib/license-public-key.ts');
  console.log('  2. Keep private.pem secret and out of git.');
  console.log('  3. Use scripts/sign-license.js to issue licenses to buyers.');
  console.log('================================================');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
