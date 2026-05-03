#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "resources/icon.png");
const OUT = resolve(ROOT, "resources/icons");

if (!existsSync(SRC)) {
  console.error(`Missing source icon: ${SRC}`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

function resizePng(srcPng, dstPng, size) {
  if (process.platform === "darwin") {
    execFileSync("sips", ["-z", String(size), String(size), srcPng, "--out", dstPng],
      { stdio: "inherit" });
  } else {
    try {
      execFileSync("magick", [srcPng, "-resize", `${size}x${size}`, dstPng],
        { stdio: "inherit" });
    } catch {
      // Fallback: full-size copy.
      writeFileSync(dstPng, readFileSync(srcPng));
    }
  }
}

resizePng(SRC, resolve(OUT, "icon-512.png"), 512);

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const tmpIcoDir = resolve(OUT, "_ico_tmp");
rmSync(tmpIcoDir, { recursive: true, force: true });
mkdirSync(tmpIcoDir, { recursive: true });
const icoSrcPaths = ICO_SIZES.map((s) => {
  const p = resolve(tmpIcoDir, `${s}.png`);
  resizePng(SRC, p, s);
  return p;
});
const icoBuffers = icoSrcPaths.map((p) => readFileSync(p));
const ico = await pngToIco(icoBuffers);
writeFileSync(resolve(OUT, "icon.ico"), ico);
rmSync(tmpIcoDir, { recursive: true, force: true });

if (process.platform === "darwin") {
  const tmp = resolve(OUT, "_iconset.iconset");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const sizes = [16, 32, 64, 128, 256, 512, 1024];
  for (const s of sizes) {
    resizePng(SRC, resolve(tmp, `icon_${s}x${s}.png`), s);
    if (s <= 512) {
      resizePng(SRC, resolve(tmp, `icon_${s}x${s}@2x.png`), s * 2);
    }
  }
  execFileSync("iconutil", ["-c", "icns", tmp, "-o", resolve(OUT, "icon.icns")],
    { stdio: "inherit" });
  rmSync(tmp, { recursive: true, force: true });
} else {
  console.warn("iconutil not available; skipping .icns. " +
    "Re-run on macOS to refresh resources/icons/icon.icns.");
}

console.log("Icons regenerated.");
