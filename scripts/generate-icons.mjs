import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const iconsDir = join(root, 'images', 'icons');
mkdirSync(iconsDir, { recursive: true });

const svgPath = join(iconsDir, 'favicon.svg');
const svgBuffer = readFileSync(svgPath);

const sizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192x192.png', size: 192 },
  { name: 'icon-512x512.png', size: 512 },
  { name: 'icon-maskable-192x192.png', size: 192, maskable: true },
  { name: 'icon-maskable-512x512.png', size: 512, maskable: true },
];

for (const { name, size, maskable } of sizes) {
  let pipeline = sharp(svgBuffer, { density: Math.max(300, size * 2) })
    .resize(size, size)
    .png();

  if (maskable) {
    // Maskable icons need extra padding (safe zone is inner 80%)
    const padding = Math.round(size * 0.1);
    const innerSize = size - padding * 2;
    const inner = await sharp(svgBuffer, { density: Math.max(300, size * 2) })
      .resize(innerSize, innerSize)
      .png()
      .toBuffer();

    await sharp({
      create: { width: size, height: size, channels: 4, background: { r: 37, g: 99, b: 235, alpha: 1 } }
    })
      .composite([{ input: inner, left: padding, top: padding }])
      .png()
      .toFile(join(iconsDir, name));

    console.log(`  ✓ ${name} (${size}x${size}, maskable)`);
    continue;
  }

  await pipeline.toFile(join(iconsDir, name));
  console.log(`  ✓ ${name} (${size}x${size})`);
}

// Generate ICO-style favicon (32x32 PNG, browsers accept this)
await sharp(svgBuffer, { density: 600 })
  .resize(32, 32)
  .png()
  .toFile(join(root, 'favicon.ico'));

console.log('  ✓ favicon.ico (32x32)');
console.log('\nAll icons generated successfully!');
