/**
 * `.mosaic` file schema (v1) + a hand-rolled validator returning a typed
 * Result. We don't use zod — the codebase has no validator dep, the schema
 * is small, and the error messages are tightly tied to the file shape.
 *
 * The on-disk file mirrors `FigureState` (under a `state` field) plus a
 * `canvas` block for figure dimensions/background and book-keeping fields
 * (schemaVersion, app, appVersion, timestamps). Pool entries on disk gain
 * an optional `relPath` (relative to the .mosaic file) and `sha256` for
 * integrity warnings; both are added by `serialize.ts`, not the reducer.
 */

import type { FigureState } from "./figure-state";
import type { ImagePoolItem } from "./pool";
import type { Panel } from "./panels";

export const CURRENT_SCHEMA_VERSION = 2;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface MosaicFileV1 {
  schemaVersion: 1;
  app: "mosaic-builder";
  appVersion: string;
  createdAt: string;
  modifiedAt: string;
  canvas: {
    widthPx: number;
    heightPx: number;
    background: string;
  };
  /**
   * Mirrors `FigureState` 1:1, EXCEPT pool entries may carry `relPath`
   * and `sha256` which the runtime store ignores (they're only used by
   * the loader). v1 carries legacy `arrow` annotations; the validator
   * accepts those, but `fromMosaicFile` migrates them to `symbol` shape
   * before constructing runtime state.
   */
  state: FigureState & {
    pool: (ImagePoolItem & { relPath?: string; sha256?: string })[];
  };
}

/** v2: identical to v1 but `arrow` annotations are replaced by `symbol`. */
export interface MosaicFileV2 extends Omit<MosaicFileV1, "schemaVersion"> {
  schemaVersion: 2;
}

/** Type alias used by callers that don't care about version. */
export type MosaicFile = MosaicFileV1 | MosaicFileV2;

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isStr(x: unknown): x is string {
  return typeof x === "string";
}

function isNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function isInt(x: unknown): x is number {
  return isNum(x) && Number.isInteger(x);
}

function isHex(x: unknown): x is string {
  return isStr(x) && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(x);
}

function err<T>(msg: string): Result<T> {
  return { ok: false, error: msg };
}

function validatePool(
  x: unknown,
  path: string,
): Result<MosaicFileV1["state"]["pool"]> {
  if (!Array.isArray(x)) return err(`${path}: expected array`);
  const arr = x as unknown[];
  const out: MosaicFileV1["state"]["pool"] = [];
  for (let i = 0; i < arr.length; i++) {
    const item: unknown = arr[i];
    if (!isObj(item)) return err(`${path}[${i}]: expected object`);
    if (!isStr(item.id)) return err(`${path}[${i}].id: expected string`);
    if (!isStr(item.filename))
      return err(`${path}[${i}].filename: expected string`);
    if (!isStr(item.filePath))
      return err(`${path}[${i}].filePath: expected string`);
    if (
      item.mime !== "image/png" &&
      item.mime !== "image/jpeg" &&
      item.mime !== "image/tiff"
    ) {
      return err(`${path}[${i}].mime: must be image/png|image/jpeg|image/tiff`);
    }
    if (!isInt(item.width) || item.width <= 0)
      return err(`${path}[${i}].width: positive int`);
    if (!isInt(item.height) || item.height <= 0)
      return err(`${path}[${i}].height: positive int`);
    if (item.bitDepth !== 8 && item.bitDepth !== 16) {
      return err(`${path}[${i}].bitDepth: must be 8 or 16`);
    }
    if (item.relPath !== undefined && !isStr(item.relPath)) {
      return err(`${path}[${i}].relPath: expected string`);
    }
    if (item.sha256 !== undefined && !isStr(item.sha256)) {
      return err(`${path}[${i}].sha256: expected string`);
    }
    if (item.calibration !== undefined) {
      const c = item.calibration;
      if (!isObj(c)) return err(`${path}[${i}].calibration: expected object`);
      if (c.unit !== "um" && c.unit !== "mm" && c.unit !== "px") {
        return err(`${path}[${i}].calibration.unit: must be um|mm|px`);
      }
      if (!isNum(c.pixelsPerUnit) || c.pixelsPerUnit <= 0) {
        return err(`${path}[${i}].calibration.pixelsPerUnit: positive number`);
      }
      if (c.source !== "tiff-meta" && c.source !== "manual") {
        return err(
          `${path}[${i}].calibration.source: must be tiff-meta|manual`,
        );
      }
    }
    out.push(item as unknown as MosaicFileV1["state"]["pool"][number]);
  }
  return { ok: true, value: out };
}

function validatePanels(x: unknown, path: string): Result<Panel[]> {
  if (!Array.isArray(x)) return err(`${path}: expected array`);
  const arr = x as unknown[];
  for (let i = 0; i < arr.length; i++) {
    const p: unknown = arr[i];
    if (!isObj(p)) return err(`${path}[${i}]: expected object`);
    if (!isStr(p.id)) return err(`${path}[${i}].id`);
    if (!isInt(p.row) || p.row < 0) return err(`${path}[${i}].row`);
    if (!isInt(p.col) || p.col < 0) return err(`${path}[${i}].col`);
    if (!isInt(p.rowSpan) || p.rowSpan < 1) return err(`${path}[${i}].rowSpan`);
    if (!isInt(p.colSpan) || p.colSpan < 1) return err(`${path}[${i}].colSpan`);
    if (p.imageId !== undefined && !isStr(p.imageId))
      return err(`${path}[${i}].imageId`);
    if (p.hidden !== undefined && typeof p.hidden !== "boolean") {
      return err(`${path}[${i}].hidden`);
    }
    if (p.transform !== undefined) {
      const t = p.transform;
      if (!isObj(t)) return err(`${path}[${i}].transform: expected object`);
      if (t.fit !== "contain" && t.fit !== "cover" && t.fit !== "stretch") {
        return err(`${path}[${i}].transform.fit`);
      }
      if (!isNum(t.panX)) return err(`${path}[${i}].transform.panX`);
      if (!isNum(t.panY)) return err(`${path}[${i}].transform.panY`);
      if (!isNum(t.zoom) || t.zoom <= 0)
        return err(`${path}[${i}].transform.zoom`);
      if (
        t.rotation !== 0 &&
        t.rotation !== 90 &&
        t.rotation !== 180 &&
        t.rotation !== 270
      ) {
        return err(`${path}[${i}].transform.rotation`);
      }
      if (typeof t.flipH !== "boolean")
        return err(`${path}[${i}].transform.flipH`);
      if (typeof t.flipV !== "boolean")
        return err(`${path}[${i}].transform.flipV`);
    }
  }
  return { ok: true, value: x as Panel[] };
}

function validateAnnotations(
  x: unknown,
  path: string,
  schemaVersion: 1 | 2,
): Result<FigureState["annotations"]> {
  if (!Array.isArray(x)) return err(`${path}: expected array`);
  const arr = x as unknown[];
  for (let i = 0; i < arr.length; i++) {
    const a: unknown = arr[i];
    if (!isObj(a)) return err(`${path}[${i}]: expected object`);
    if (!isStr(a.id)) return err(`${path}[${i}].id`);
    if (!isNum(a.z)) return err(`${path}[${i}].z`);
    if (a.panelId !== undefined && !isStr(a.panelId))
      return err(`${path}[${i}].panelId`);
    if (a.imageId !== undefined && !isStr(a.imageId))
      return err(`${path}[${i}].imageId`);
    const k = a.kind;
    if (k === "text") {
      if (
        !isNum(a.x) ||
        !isNum(a.y) ||
        !isStr(a.text) ||
        !isStr(a.font) ||
        !isNum(a.sizePt) ||
        typeof a.bold !== "boolean" ||
        typeof a.italic !== "boolean" ||
        !isStr(a.color)
      ) {
        return err(`${path}[${i}]: malformed text annotation`);
      }
      if (a.anchor !== undefined && !isImageAnchor(a.anchor)) {
        return err(`${path}[${i}].anchor`);
      }
    } else if (k === "arrow") {
      // arrow annotations only exist in v1 files; v2 files use `symbol`.
      if (schemaVersion !== 1) {
        return err(
          `${path}[${i}].kind: arrow not allowed in v${schemaVersion}`,
        );
      }
      if (
        !isNum(a.x1) ||
        !isNum(a.y1) ||
        !isNum(a.x2) ||
        !isNum(a.y2) ||
        !isStr(a.color) ||
        !isNum(a.thicknessPx) ||
        (a.head !== "none" && a.head !== "open" && a.head !== "filled")
      ) {
        return err(`${path}[${i}]: malformed arrow annotation`);
      }
      if (a.anchor1 !== undefined && !isImageAnchor(a.anchor1)) {
        return err(`${path}[${i}].anchor1`);
      }
      if (a.anchor2 !== undefined && !isImageAnchor(a.anchor2)) {
        return err(`${path}[${i}].anchor2`);
      }
    } else if (k === "symbol") {
      // symbol annotations only exist in v2 files; v1 files use `arrow`.
      if (schemaVersion !== 2) {
        return err(
          `${path}[${i}].kind: symbol not allowed in v${schemaVersion}`,
        );
      }
      if (
        !isStr(a.symbolId) ||
        !isNum(a.x) ||
        !isNum(a.y) ||
        !isNum(a.sizePx) ||
        a.sizePx <= 0 ||
        !isNum(a.rotationDeg) ||
        !isStr(a.color) ||
        !isNum(a.strokeWidthPx) ||
        a.strokeWidthPx < 0
      ) {
        return err(`${path}[${i}]: malformed symbol annotation`);
      }
      if (a.anchor !== undefined && !isImageAnchor(a.anchor)) {
        return err(`${path}[${i}].anchor`);
      }
    } else if (k === "box") {
      if (
        !isNum(a.x) ||
        !isNum(a.y) ||
        !isNum(a.w) ||
        !isNum(a.h) ||
        !isStr(a.stroke) ||
        !isNum(a.strokeWidthPx)
      ) {
        return err(`${path}[${i}]: malformed box annotation`);
      }
      if (a.anchor1 !== undefined && !isImageAnchor(a.anchor1)) {
        return err(`${path}[${i}].anchor1`);
      }
      if (a.anchor2 !== undefined && !isImageAnchor(a.anchor2)) {
        return err(`${path}[${i}].anchor2`);
      }
    } else if (k === "scalebar") {
      if (
        !isStr(a.panelId) ||
        !isNum(a.lengthValue) ||
        (a.lengthUnit !== "um" &&
          a.lengthUnit !== "mm" &&
          a.lengthUnit !== "px")
      ) {
        return err(`${path}[${i}]: malformed scalebar annotation`);
      }
    } else {
      return err(
        `${path}[${i}].kind: must be text|symbol|box|scalebar (or arrow in v1)`,
      );
    }
  }
  return { ok: true, value: x as FigureState["annotations"] };
}

function isImageAnchor(x: unknown): boolean {
  return isObj(x) && isNum(x.imgU) && isNum(x.imgV);
}

function validateGlobalStyle(
  x: unknown,
  path: string,
): Result<FigureState["globalStyle"]> {
  if (!isObj(x)) return err(`${path}: expected object`);
  const l = x.letters;
  if (!isObj(l)) return err(`${path}.letters: expected object`);
  if (typeof l.enabled !== "boolean") return err(`${path}.letters.enabled`);
  if (
    !isStr(l.font) ||
    !isNum(l.sizePt) ||
    !isHex(l.color) ||
    !isNum(l.paddingPx) ||
    typeof l.bold !== "boolean"
  ) {
    return err(`${path}.letters: malformed`);
  }
  if (l.bgColor !== undefined && !isHex(l.bgColor))
    return err(`${path}.letters.bgColor`);
  if (
    l.corner !== "tl" &&
    l.corner !== "tr" &&
    l.corner !== "bl" &&
    l.corner !== "br"
  ) {
    return err(`${path}.letters.corner`);
  }
  const s = x.scalebar;
  if (!isObj(s)) return err(`${path}.scalebar: expected object`);
  if (
    !isStr(s.font) ||
    !isNum(s.sizePt) ||
    !isHex(s.color) ||
    !isHex(s.barColor) ||
    !isNum(s.thicknessPx) ||
    !isNum(s.paddingPx) ||
    typeof s.showLabel !== "boolean"
  ) {
    return err(`${path}.scalebar: malformed`);
  }
  if (
    s.corner !== "tl" &&
    s.corner !== "tr" &&
    s.corner !== "bl" &&
    s.corner !== "br"
  ) {
    return err(`${path}.scalebar.corner`);
  }
  return { ok: true, value: x as unknown as FigureState["globalStyle"] };
}

export function validateMosaicFile(x: unknown): Result<MosaicFile> {
  if (!isObj(x)) return err("root: expected object");
  if (x.schemaVersion === undefined) return err("schemaVersion: required");
  if (x.schemaVersion !== 1 && x.schemaVersion !== 2) {
    return err(`schemaVersion: unsupported (${String(x.schemaVersion)})`);
  }
  const sv: 1 | 2 = x.schemaVersion;
  if (x.app !== "mosaic-builder") return err("app: must be 'mosaic-builder'");
  if (!isStr(x.appVersion)) return err("appVersion: expected string");
  if (!isStr(x.createdAt)) return err("createdAt: expected ISO string");
  if (!isStr(x.modifiedAt)) return err("modifiedAt: expected ISO string");

  if (!isObj(x.canvas)) return err("canvas: expected object");
  if (!isInt(x.canvas.widthPx) || x.canvas.widthPx <= 0)
    return err("canvas.widthPx");
  if (!isInt(x.canvas.heightPx) || x.canvas.heightPx <= 0)
    return err("canvas.heightPx");
  if (!isHex(x.canvas.background))
    return err("canvas.background: expected #RRGGBB(AA)");

  if (!isObj(x.state)) return err("state: expected object");
  const st = x.state;
  if (!isInt(st.rows) || st.rows < 1 || st.rows > 10)
    return err("state.rows: 1..10");
  if (!isInt(st.cols) || st.cols < 1 || st.cols > 10)
    return err("state.cols: 1..10");
  if (!isInt(st.gutterPx) || st.gutterPx < 0)
    return err("state.gutterPx: non-negative int");
  if (!isHex(st.gutterColor)) return err("state.gutterColor");
  // Optional in v1 (added post-launch); pre-toggle files default to true.
  if (st.outerGutter !== undefined && typeof st.outerGutter !== "boolean") {
    return err("state.outerGutter: expected boolean");
  }

  const pool = validatePool(st.pool, "state.pool");
  if (!pool.ok) return pool;
  const panels = validatePanels(st.panels, "state.panels");
  if (!panels.ok) return panels;
  const ann = validateAnnotations(st.annotations, "state.annotations", sv);
  if (!ann.ok) return ann;
  const gs = validateGlobalStyle(st.globalStyle, "state.globalStyle");
  if (!gs.ok) return gs;

  if (!isObj(st.letterOverrides))
    return err("state.letterOverrides: expected object");
  for (const k in st.letterOverrides) {
    if (!isStr(st.letterOverrides[k])) {
      return err(`state.letterOverrides.${k}: expected string`);
    }
  }

  return { ok: true, value: x as unknown as MosaicFile };
}
