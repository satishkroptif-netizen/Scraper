'use strict';

/**
 * sign-license.js
 * Run by the seller to issue a signed offline license file to a buyer.
 *
 * Usage:
 *   node scripts/sign-license.js "buyer@example.com" "ORD-12345" "2027-10-27" "ABCD-1234-EFGH"
 *
 * If you omit machineId, the license will work on any machine (less restrictive).
 * Outputs: license-<customer>.json -> email this to the buyer.
 */

const crypto = require('crypto');
const fsp = require('fs/promises');
const path = require('path');

const [customer, orderId, expiry, machineId] = process.argv.slice(2);

if (!customer || !orderId || !expiry) {
  console.error('Usage: node scripts/sign-license.js <customer-email> <order-id> <expiry-date> [machine-id]');
  process.exit(1);
}

async function main() {
  const dir = path.resolve(__dirname, '..', 'license-keys');
  const privateKeyPath = path.join(dir, 'private.pem');
  try {
    await fsp.access(privateKeyPath);
  } catch {
    console.error(`Private key not found at ${privateKeyPath}`);
    console.error('Run: node scripts/generate-license-keys.js');
    process.exit(1);
  }

  const privateKey = await fsp.readFile(privateKeyPath, 'utf8');

  const payload = {
    customer,
    orderId,
    expiry,
    machineId: machineId || null,
    issuedAt: new Date().toISOString(),
  };

  const payloadString = JSON.stringify(payload, null, 2);
  const signature = crypto.sign(
    'sha256',
    Buffer.from(payloadString),
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST }
  );

  const license = {
    ...payload,
    signature: signature.toString('base64'),
  };

  const safeCustomer = String(customer).replace(/[<>:"/\\|?*\s]+/g, '_');
  const outFile = path.resolve(__dirname, '..', `license-${safeCustomer}.json`);
  await fsp.writeFile(outFile, JSON.stringify(license, null, 2), 'utf8');

  console.log('================================================');
  console.log(' License file created');
  console.log('================================================');
  console.log('File:', outFile);
  console.log('Customer:', customer);
  console.log('Order:', orderId);
  console.log('Expires:', expiry);
  console.log('Machine locked:', machineId || 'No (any machine)');
  console.log('');
  console.log('Email this file to the buyer:');
  console.log('  ', outFile);
  console.log('================================================');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
