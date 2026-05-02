export const DRAG_MIME = "application/x-mosaic-drag";

export type DragPayload =
  | { kind: "tray"; imageId: string }
  | { kind: "cell"; row: number; col: number };

export function serializeDrag(p: DragPayload): string {
  return JSON.stringify(p);
}

export function parseDrag(raw: string): DragPayload | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.kind === "tray") {
    if (typeof o.imageId !== "string") return null;
    return { kind: "tray", imageId: o.imageId };
  }
  if (o.kind === "cell") {
    if (typeof o.row !== "number" || typeof o.col !== "number") return null;
    return { kind: "cell", row: o.row, col: o.col };
  }
  return null;
}
