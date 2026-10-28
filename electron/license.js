'use strict';

/**
 * license.js
 * Offline self-signed license verification for Step in Scraper.
 *
 * The seller signs license files with their private RSA key (scripts/sign-license.js).
 * The app embeds the matching public key and verifies the signature at startup.
 * No license server is needed after purchase.
 */

const crypto = require('crypto');
const fsp = require('fs/promises');
const path = require('path');

// ---------------------------------------------------------------------------
// SELLER: Replace the placeholder below with your generated RSA public key.
// Run `node scripts/generate-license-keys.js`, then paste the contents of
// license-keys/public.pem between the backticks.
// ---------------------------------------------------------------------------
const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
PASTE_YOUR_GENERATED_PUBLIC_KEY_HERE
-----END PUBLIC KEY-----`;

function publicKeyPem() {
  if (!LICENSE_PUBLIC_KEY_PEM || LICENSE_PUBLIC_KEY_PEM.includes('PASTE_YOUR_GENERATED_PUBLIC_KEY_HERE')) {
    return null;
  }
  return LICENSE_PUBLIC_KEY_PEM;
}

function hardwareId() {
  try {
    const { execSync } = require('child_process');
    const uuid = execSync('wmic csproduct get uuid', { encoding: 'utf8', windowsHide: true })
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

function verifySignature(payload, signatureBase64) {
  const pem = publicKeyPem();
  if (!pem) return { valid: false, reason: 'Public key not configured by the seller.' };

  const verifier = crypto.createVerify('sha256');
  verifier.update(JSON.stringify(payload, null, 2));
  verifier.end();

  try {
    const ok = verifier.verify(
      pem,
      Buffer.from(signatureBase64, 'base64'),
      { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST }
    );
    return { valid: ok, reason: ok ? null : 'Invalid signature.' };
  } catch (error) {
    return { valid: false, reason: 'Signature verification failed.' };
  }
}

async function loadLicense(dataDir) {
  const licenseFile = path.join(dataDir, 'license.json');
  try {
    const text = await fsp.readFile(licenseFile, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function loadLicenseSync(dataDir) {
  const fs = require('fs');
  const licenseFile = path.join(dataDir, 'license.json');
  try {
    const text = fs.readFileSync(licenseFile, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function validateLicense(license, expectedMachineId) {
  const issues = [];

  if (!license || typeof license !== 'object') {
    return { valid: false, reason: 'No license file found. Please purchase Step in Scraper.' };
  }
  for (const field of ['customer', 'orderId', 'expiry', 'issuedAt', 'signature']) {
    if (!license[field]) {
      issues.push(`Missing field: ${field}.`);
    }
  }
  if (issues.length) return { valid: false, reason: issues.join(' ') };

  // Expiry check
  const expiryDate = new Date(license.expiry);
  const now = new Date();
  if (isNaN(expiryDate.getTime())) {
    return { valid: false, reason: 'Invalid expiry date in license.' };
  }
  if (expiryDate < now) {
    return { valid: false, reason: `License expired on ${license.expiry}. Please renew.` };
  }

  // Machine lock check
  if (license.machineId && license.machineId !== expectedMachineId) {
    return {
      valid: false,
      reason: 'This license is locked to a different computer. Contact support.',
    };
  }

  // Signature check
  const sigResult = verifySignature(
    { customer: license.customer, orderId: license.orderId, expiry: license.expiry, issuedAt: license.issuedAt, machineId: license.machineId },
    license.signature
  );
  if (!sigResult.valid) return { valid: false, reason: sigResult.reason };

  return { valid: true, license };
}

module.exports = { loadLicense, loadLicenseSync, validateLicense, hardwareId, publicKeyPem };
