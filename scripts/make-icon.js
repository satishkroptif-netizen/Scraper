'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { detectBrowser } = require('../electron/chrome');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'build', 'icon.svg'), 'utf8');
const sizes = [16, 24, 32, 48, 64, 128, 256];
const outputs = [];

function makeIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6 + count * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  let offset = 6 + count * 16;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(image.size >= 256 ? 0 : image.size, entry);
    header.writeUInt8(image.size >= 256 ? 0 : image.size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.buffer.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.buffer.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.buffer)]);
}

async function main() {
  const browser = detectBrowser();
  const context = await chromium.launchPersistentContext(path.join(root, '.probe', 'icon-profile'), {
    executablePath: browser.path,
    headless: true,
    viewport: { width: 512, height: 512 },
    deviceScaleFactor: 1,
    args: ['--force-device-scale-factor=1'],
  });
  const page = context.pages()[0] || (await context.newPage());

  for (const size of [...sizes, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`
    );
    await page.waitForTimeout(120);
    const buffer = await page.screenshot({ omitBackground: true });
    if (size === 512) {
      fs.writeFileSync(path.join(root, 'build', 'icon.png'), buffer);
    } else {
      outputs.push({ size, buffer });
    }
    console.log('rendered', size);
  }

  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), makeIco(outputs));
  console.log('wrote build/icon.ico and build/icon.png');
  await context.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
