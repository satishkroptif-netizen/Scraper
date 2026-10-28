'use strict';

/**
 * license.js
 * Offline license verification for Step in Scraper.
 * Workflow:
 *   1. Seller runs `scripts/generate-license-keys.js` to create RSA key pair.
 *   2. Seller runs `scripts/sign-license.js` for each buyer, producing a signed
 *      `license-<buyer>.json` file (contains the 12-char key + RSA signature).
 *   3. Seller emails the signed file to the buyer.
 *   4. Buyer runs Step in Scraper and either:
 *      a) Places the signed `license.json` in `%APPDATA%\Step in Scraper\data\`, OR
 *      b) Enters the 12-char alphanumeric key (the app verifies the embedded signature).
 * No license server needed after purchase.
 */

const crypto = require('crypto');
const fsp = require('fs/promises');
const path = require('path');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// SELLER: Replace the placeholder below with your generated RSA public key.
// Run `node scripts/generate-license-keys.js` to create your key pair,
// then paste the contents of `license-keys/public.pem` between the backticks.
// ---------------------------------------------------------------------------
const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAor4VJU1Khwu3mxqXZfiw
9H0DJW6VXJy/9aHuL1fwDrvfvQycd6r7iWIs5Hg4Gn6q+t9WxEbGIAzmNW4h5O8W
tNduA6oy2NKlmr6h0KNrh0mihgWHXB0lyO1JR4OZ+EMJujGjbzrMnxOHuCtX3Tgc
x8sZhhcZ7UXvN9+ijlu9ehxLwLR+yhPOEyTRBYpJKXlS4obfdg0nv1st+K41aZXn
ze4j1iI5kcoOxIfBWMFAOhFfTXcpiJ0Wuw/aPMdXmzXGuzXtIVCLiBjUhg8u8USu
Cet4VXRLHfZL5yX5FAcEiBgnK96fKiteCDShZ6SDnUpyqceAg29+kwPhtm5Sf52h
G0XWAE6gOa7YUoqh+Gf848WLgcqq4+zz35YVs7VjEd/tI4wdtqMpdSJvP3CuwNEX
thY+pbxS/amuHEFJni8qYLXlqqSVMi1otAueRi+tm1NvIb08+a7oDJrRlBwyip6h
Ca/KmoGGNDy0E55VsLVPI6vObUzcCEDCglMZ9jPnjG/zuUv2bQU7hfGj31bFVpKp
M/vyABHEd2gkGwFhgN0evz8KrMKfNoZg+J5VqyB3EKmNhajRtFVHU8YN0B4IMjgU
nojLBGiplqZUwpTjD8Sbltf7nZccPXPctc75PDlVdZV4yGSAryeqykQZctsnhpyz
zW5OLl3BelCpWnUzu0nhZrMCAwEAAQ==
-----END PUBLIC KEY-----`;

// ———————————————————————————————————————————————————————————————————————
// Helper: hardware ID (bind license to one machine)
// ———————————————————————————————————————————————————————————————————————
function hardwareId() {
  try {
    const uuid = execSync('wmic csproduct get uuid', {
      encoding: 'utf8',
      windowsHide: true,
    })
      .toString()
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .find((line) => line.includes('-'));
    return uuid || null;
  } catch {
    return null;
  }
}

// ———————————————————————————————————————————————————————————————————————
// Key alphabet: 22 chars, unambiguous (no 0, O, I, 1, l)
// ———————————————————————————————————————————————————————————————————————
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomKey(length = 12) {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += KEY_ALPHABET[Math.floor(Math.random() * KEY_ALPHABET.length)];
  }
  return result;
}

// ———————————————————————————————————————————————————————————————————————
// Signature verification (public key only)
// ———————————————————————————————————————————————————————————————————————

function publicKeyPem() {
  if (!LICENSE_PUBLIC_KEY_PEM || LICENSE_PUBLIC_KEY_PEM.includes('PASTE_YOUR_GENERATED_PUBLIC_KEY_HERE')) {
    return null;
  }
  return LICENSE_PUBLIC_KEY_PEM;
}

function verifyKeySignature(key, signatureBase64) {
  const pem = publicKeyPem();
  if (!pem) return { valid: false, reason: 'Public key not configured by the seller.' };
  const verifier = crypto.createVerify('sha256');
  verifier.update(key);
  verifier.end();
  try {
    const ok = verifier.verify(pem, Buffer.from(signatureBase64, 'base64'), { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST });
    return { valid: ok, reason: ok ? null : 'Invalid signature.' };
  } catch (error) {
    return { valid: false, reason: 'Signature verification failed.' };
  }
}

// ———————————————————————————————————————————————————————————————————————
// License data folder
// ———————————————————————————————————————————————————————————————————————
const dataDir = path.resolve(__dirname, '..', 'data');

async function loadLicenseJson() {
  const f = path.join(dataDir, 'license.json');
  try {
    const t = await fsp.readFile(f, 'utf8');
    return JSON.parse(t);
  } catch {
    if (fsp.existsSync(f)) throw new Error('corrupt');
    return null;
  }
}

async function saveLicenseJson(license) {
  await fsp.mkdir(dataDir, { recursive: true });
  const f = path.join(dataDir, 'license.json');
  await fsp.writeFile(f, JSON.stringify(license, null, 2), 'utf8');
}

// ———————————————————————————————————————————————————————————————————————
// Used-key tracking (one-time use)
// ———————————————————————————————————————————————————————————————————————
async function loadUsedKeys() {
  const f = path.join(dataDir, 'used-keys.json');
  try {
    const t = await fsp.readFile(f, 'utf8');
    return new Set(JSON.parse(t));
  } catch {
    return new Set();
  }
}

async function saveUsedKeys(used) {
  await fsp.mkdir(dataDir, { recursive: true });
  const f = path.join(dataDir, 'used-keys.json');
  await fsp.writeFile(f, JSON.stringify([...used], null, 2), 'utf8');
}

// ———————————————————————————————————————————————————————————————————————
// Core: validate a 12-char key whose signature is known.
// The caller (seller) must have signed the key with the private key,
// producing a signatureBase64. The app only verifies.
// ———————————————————————————————————————————————————————————————————————

async function validateKeyWithSig(key, signatureBase64) {
  // 1. Format check
  if (!/^[A-HJ-NP-Z2-9]{12}$/.test(key)) return { valid: false, reason: 'Invalid key format. Must be 12 alphanumeric characters (no 0, O, I, 1, l).' };

  // 2. Signature check
  const sigVerify = verifyKeySignature(key, signatureBase64);
  if (!sigVerify.valid) return { valid: false, reason: sigVerify.reason };

  // 3. One-time-use check
  const usedSet = await loadUsedKeys();
  if (usedSet.has(key)) return { valid: false, reason: 'This key has already been used. Each key is one-time use only.' };

  // Mark as used
  usedSet.add(key);
  await saveUsedKeys(usedSet);

  return { valid: true, key, reason: null };
}

// ———————————————————————————————————————————————————————————————————————
// Legacy: license.json file mode (existing)
// ———————————————————————————————————————————————————————————————————————

async function loadLicenseFile() {
  const lic = await loadLicenseJson();
  if (!lic || !lic.valid) return null;
  const machineId = hardwareId();
  if (lic.machineId && lic.machineId !== machineId) return { valid: false, reason: 'This license is locked to a different computer.' };
  return { valid: true, license: lic };
}

// ———————————————————————————————————————————————————————————————————————
// Expose
// ———————————————————————————————————————————————————————————————————————

module.exports = {
  loadLicenseJson,
  saveLicenseJson,
  loadUsedKeys,
  saveUsedKeys,
  randomKey,
  verifyKeySignature,
  validateKeyWithSig,
  loadLicenseFile,
  hardwareId,
  publicKeyPem,
};