// scripts/make-fixture-png.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";

const W = 256, H = 256;
// Diagonal gradient so the test image is visually distinguishable.
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0; // filter byte: None
  for (let x = 0; x < W; x++) {
    const o = y * (1 + W * 3) + 1 + x * 3;
    raw[o]     = x;
    raw[o + 1] = y;
    raw[o + 2] = (x + y) >> 1;
  }
}
const idat = deflateSync(raw);

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, c]);
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 2;   // color type: truecolor RGB
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const png = Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
mkdirSync("resources/fixtures", { recursive: true });
writeFileSync("resources/fixtures/sample.png", png);
console.log("wrote resources/fixtures/sample.png", png.length, "bytes");
