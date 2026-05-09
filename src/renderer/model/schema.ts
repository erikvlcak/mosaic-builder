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

import type { FigureState, LetterOverride } from "./figure-state";
import type { ImagePoolItem } from "./pool";
import type { Panel } from "./panels";
import type { Annotation, ImageAnchor } from "./annotations";

export const CURRENT_SCHEMA_VERSION = 3;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * V1-only annotation shape: the schema-1 arrow annotation. Kept here as a
 * data-only mirror of the runtime ArrowAnnotation we used to have (now
 * deleted — see migrate-v1-to-v2.ts for the runtime migration).
 */
export interface V1ArrowAnnotation {
  id: string;
  kind: "arrow";
  z: number;
  panelId?: string;
  imageId?: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  anchor1?: ImageAnchor;
  anchor2?: ImageAnchor;
  color: string;
  thicknessPx: number;
  head: "none" | "open" | "filled";
}

/**
 * What an annotation may legally be inside a v1 .mosaic file. Equivalent to
 * the post-Task-2 `Annotation` union plus the deleted ArrowAnnotation.
 */
export type V1Annotation = Annotation | V1ArrowAnnotation;

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
   * the loader), and `annotations` may include legacy `arrow` shapes.
   * `fromMosaicFile` migrates arrows to `symbol` shape before constructing
   * runtime state.
   */
  state: Omit<FigureState, "annotations" | "pool"> & {
    annotations: V1Annotation[];
    pool: (ImagePoolItem & { relPath?: string; sha256?: string })[];
  };
}

/** v2: identical to v1 but `arrow` annotations are replaced by `symbol`. */
export interface MosaicFileV2
  extends Omit<MosaicFileV1, "schemaVersion" | "state"> {
  schemaVersion: 2;
  state: Omit<MosaicFileV1["state"], "annotations"> & {
    annotations: Annotation[];
  };
}

/**
 * v3: spec 08 — `letterOverrides` becomes `Record<panelId, LetterOverride>`
 * (was `Record<panelId, string>`); `letterPattern` is added; `globalStyle.letters`
 * gains `italic`. Loader migrates v1/v2 → v3 in-memory; we only WRITE v3.
 */
export interface MosaicFileV3
  extends Omit<MosaicFileV2, "schemaVersion" | "state"> {
  schemaVersion: 3;
  state: Omit<MosaicFileV2["state"], "letterOverrides"> & {
    letterOverrides: Record<string, LetterOverride>;
    letterPattern: FigureState["letterPattern"];
  };
}

/** Type alias used by callers that don't care about version. */
export type MosaicFile = MosaicFileV1 | MosaicFileV2 | MosaicFileV3;

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
      // crop is optional (added in spec 09); pre-spec-09 files omit the field.
      // We accept any in-range rect on disk and reject out-of-range so corrupt
      // values can't slip into the renderer (the reducer also validates, but
      // the load path skips it — RESET_TO_STATE writes the state directly).
      if (t.crop !== undefined) {
        const c = t.crop;
        if (!isObj(c))
          return err(`${path}[${i}].transform.crop: expected object`);
        if (
          !isNum(c.x) ||
          !isNum(c.y) ||
          !isNum(c.w) ||
          !isNum(c.h) ||
          c.x < 0 ||
          c.y < 0 ||
          c.w <= 0 ||
          c.h <= 0 ||
          c.x + c.w > 1 ||
          c.y + c.h > 1
        ) {
          return err(`${path}[${i}].transform.crop: out of range`);
        }
      }
    }
  }
  return { ok: true, value: x as Panel[] };
}

function validateAnnotations(
  x: unknown,
  path: string,
  schemaVersion: 1 | 2 | 3,
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
      // symbol annotations only exist in v2+ files; v1 files use `arrow`.
      if (schemaVersion === 1) {
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
  // Italic is added in spec 08; pre-spec-08 files lack the field. Loader
  // defaults missing values to false. Reject only if it's present-and-wrong.
  if (l.italic !== undefined && typeof l.italic !== "boolean") {
    return err(`${path}.letters.italic`);
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
  if (x.schemaVersion !== 1 && x.schemaVersion !== 2 && x.schemaVersion !== 3) {
    return err(`schemaVersion: unsupported (${String(x.schemaVersion)})`);
  }
  const sv: 1 | 2 | 3 = x.schemaVersion;
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
  // v1/v2 stored letterOverrides as Record<panelId, string>. v3 stores
  // Record<panelId, LetterOverride>. We accept either at the validator level
  // and let `fromMosaicFile` migrate the old shape — that keeps the type
  // story for the in-memory FigureState clean (one shape, one path).
  const lo = st.letterOverrides;
  for (const k in lo) {
    const v = lo[k];
    if (sv === 3) {
      if (!isObj(v)) {
        return err(
          `state.letterOverrides.${k}: expected LetterOverride object`,
        );
      }
      const ov = v;
      if (ov.text !== undefined && !isStr(ov.text)) {
        return err(`state.letterOverrides.${k}.text`);
      }
      if (ov.style !== undefined) {
        if (!isObj(ov.style))
          return err(`state.letterOverrides.${k}.style: expected object`);
        const s = ov.style;
        if (s.color !== undefined && !isHex(s.color))
          return err(`state.letterOverrides.${k}.style.color`);
        if (s.bgColor !== undefined && !isHex(s.bgColor))
          return err(`state.letterOverrides.${k}.style.bgColor`);
        if (s.font !== undefined && !isStr(s.font))
          return err(`state.letterOverrides.${k}.style.font`);
        if (s.sizePt !== undefined && !isNum(s.sizePt))
          return err(`state.letterOverrides.${k}.style.sizePt`);
        if (s.bold !== undefined && typeof s.bold !== "boolean")
          return err(`state.letterOverrides.${k}.style.bold`);
        if (s.italic !== undefined && typeof s.italic !== "boolean")
          return err(`state.letterOverrides.${k}.style.italic`);
      }
    } else {
      if (!isStr(v)) {
        return err(`state.letterOverrides.${k}: expected string`);
      }
    }
  }
  // letterPattern only exists in v3 files; older files default in the loader.
  if (sv === 3) {
    if (
      st.letterPattern !== "uppercase" &&
      st.letterPattern !== "lowercase" &&
      st.letterPattern !== "numeric" &&
      st.letterPattern !== "uppercase-paren" &&
      st.letterPattern !== "uppercase-bracket" &&
      st.letterPattern !== "rowcol-mixed"
    ) {
      return err("state.letterPattern: invalid");
    }
  }

  return { ok: true, value: x as unknown as MosaicFile };
}
