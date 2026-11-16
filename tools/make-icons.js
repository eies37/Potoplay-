'use strict';

/* Génère les icônes PNG de la PWA (aucune dépendance) : un gamepad néon sur dégradé sombre. */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.slice(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function makeCanvas(w, h) {
  return { w, h, px: Buffer.alloc(w * h * 4) };
}

function setPx(c, x, y, r, g, b, a = 255) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  c.px[i] = r; c.px[i + 1] = g; c.px[i + 2] = b; c.px[i + 3] = a;
}

function fillRect(c, x0, y0, w, h, col) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPx(c, x, y, ...col);
}

function fillCircle(c, cx, cy, r, col) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) setPx(c, x, y, ...col);
    }
  }
}

function fillRoundRect(c, x0, y0, w, h, r, col) {
  fillRect(c, x0 + r, y0, w - 2 * r, h, col);
  fillRect(c, x0, y0 + r, w, h - 2 * r, col);
  fillCircle(c, x0 + r, y0 + r, r, col);
  fillCircle(c, x0 + w - r, y0 + r, r, col);
  fillCircle(c, x0 + r, y0 + h - r, r, col);
  fillCircle(c, x0 + w - r, y0 + h - r, r, col);
}

function lerp(a, b, t) { return a + (b - a) * t; }

function drawIcon(size) {
  const S = 512;
  const c = makeCanvas(S, S);
  for (let y = 0; y < S; y++) {
    const t = y / S;
    const r = Math.round(lerp(0x0b, 0x2e, t));
    const g = Math.round(lerp(0x0f, 0x1b, t));
    const b = Math.round(lerp(0x1a, 0x4b, t));
    for (let x = 0; x < S; x++) setPx(c, x, y, r, g, b);
  }
  const u = S / 512;
  const body = [0x22, 0xd3, 0xee];
  const dark = [0x0b, 0x0f, 0x1a];
  const pink = [0xf4, 0x72, 0xb6];
  const yellow = [0xfb, 0xbf, 0x24];
  fillRoundRect(c, 86 * u, 186 * u, 340 * u, 150 * u, 62 * u, body);
  fillRoundRect(c, 120 * u, 300 * u, 60 * u, 60 * u, 22 * u, body);
  fillRoundRect(c, 332 * u, 300 * u, 60 * u, 60 * u, 22 * u, body);
  fillRect(c, 168 * u, 226 * u, 26 * u, 76 * u, dark);
  fillRect(c, 142 * u, 252 * u, 78 * u, 26 * u, dark);
  fillCircle(c, 330 * u, 248 * u, 17 * u, pink);
  fillCircle(c, 366 * u, 278 * u, 17 * u, yellow);
  const out = makeCanvas(size, size);
  const scale = S / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const j = (Math.floor(y * scale) * S + Math.floor(x * scale)) * 4;
      out.px[i] = c.px[j]; out.px[i + 1] = c.px[j + 1]; out.px[i + 2] = c.px[j + 2]; out.px[i + 3] = c.px[j + 3];
    }
  }
  return encodePNG(size, size, out.px);
}

const outDir = path.join(__dirname, '..', 'public');
fs.writeFileSync(path.join(outDir, 'icon-192.png'), drawIcon(192));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), drawIcon(512));
fs.writeFileSync(path.join(outDir, 'icon-maskable-512.png'), drawIcon(512));
console.log('✅ icônes générées : icon-192.png, icon-512.png, icon-maskable-512.png');
