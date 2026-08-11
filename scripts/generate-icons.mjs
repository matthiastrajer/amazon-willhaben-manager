#!/usr/bin/env node
/**
 * Generates the extension PNG icons (Chrome MV3 does not accept SVG icons).
 *
 * Everything is drawn analytically and encoded with Node's built-in zlib, so
 * the repo needs no image tooling or binary art assets. Shapes are rendered
 * with 4x supersampling for clean edges at 16px.
 */
import zlib from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';

const outDir = fileURLToPath(new URL('../public/icons', import.meta.url));
const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling factor

// ---------------------------------------------------------------- png encoder

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** rgba: Uint8Array of size*size*4 */
function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------- geometry

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;

/** signed-distance style coverage of a rounded rectangle, in unit coordinates */
function roundedRectCoverage(x, y, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  const dx = x - cx;
  const dy = y - cy;
  const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
  if (!inside) return 0;
  return dx * dx + dy * dy <= r * r ? 1 : 0;
}

/** Arrow glyph "→": a horizontal shaft plus a triangular head. */
function arrowCoverage(x, y) {
  const shaft = x >= 0.2 && x <= 0.63 && y >= 0.445 && y <= 0.555;
  // triangle head pointing right, apex at (0.82, 0.5)
  const hx0 = 0.55;
  const hx1 = 0.82;
  let head = false;
  if (x >= hx0 && x <= hx1) {
    const t = (x - hx0) / (hx1 - hx0);
    const half = mix(0.19, 0.0, t);
    head = Math.abs(y - 0.5) <= half;
  }
  return shaft || head ? 1 : 0;
}

function render(size) {
  const s = size * SS;
  const acc = new Float32Array(size * size * 4);

  for (let py = 0; py < s; py++) {
    for (let px = 0; px < s; px++) {
      const x = (px + 0.5) / s;
      const y = (py + 0.5) / s;

      const bg = roundedRectCoverage(x, y, 0.04, 0.04, 0.96, 0.96, 0.22);
      if (!bg) continue;

      // vertical gradient: indigo -> violet
      const t = clamp01((x + y) / 2);
      let r = mix(79, 124, t);
      let g = mix(70, 58, t);
      let b = mix(229, 237, t);
      let a = 255;

      if (arrowCoverage(x, y)) {
        r = 255;
        g = 255;
        b = 255;
      }

      const ox = Math.floor(px / SS);
      const oy = Math.floor(py / SS);
      const i = (oy * size + ox) * 4;
      acc[i] += r;
      acc[i + 1] += g;
      acc[i + 2] += b;
      acc[i + 3] += a;
    }
  }

  const samples = SS * SS;
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const alpha = acc[i * 4 + 3] / samples;
    const cover = alpha / 255;
    // un-premultiply so edge pixels keep the fill colour
    const denom = cover > 0 ? acc[i * 4 + 3] / 255 : 1;
    rgba[i * 4] = cover > 0 ? Math.round(acc[i * 4] / denom) : 0;
    rgba[i * 4 + 1] = cover > 0 ? Math.round(acc[i * 4 + 1] / denom) : 0;
    rgba[i * 4 + 2] = cover > 0 ? Math.round(acc[i * 4 + 2] / denom) : 0;
    rgba[i * 4 + 3] = Math.round(alpha);
  }
  return rgba;
}

mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  const png = encodePng(size, render(size));
  const file = path.join(outDir, `icon-${size}.png`);
  writeFileSync(file, png);
  console.log(`wrote ${path.relative(process.cwd(), file)} (${png.length} bytes)`);
}
