import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import { EditorCanvas } from "./components/Canvas/EditorCanvas";
import { ExportButton } from "./components/Toolbar/ExportButton";
import { Tray } from "./components/Sidebar/Tray";
import { GridCells, type DropEvent } from "./components/Grid/GridCells";
import {
  initialFigureState,
  type FigureState,
} from "./model/figure-state";
import { addToPool, figureReducer } from "./model/figure-actions";
import { newImageId, type ImagePoolItem } from "./model/pool";
import { deriveFigure } from "./model/figure-derivations";
import { decodeImageBytes } from "./image/decode-bytes";
import { dispatchDrop } from "./dnd/dispatch-drop";

const FIGURE_PX_W = 800;
const FIGURE_PX_H = 600;
const GUTTER_PX = 12;
const CANVAS_BG = "#FFFFFF";
const GUTTER_COLOR = "#FFFFFF";
const CANVAS_CSS_W = 800;
const CANVAS_CSS_H = 600;

function basename(p: string): string {
  const ix = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return ix >= 0 ? p.slice(ix + 1) : p;
}

export function App(): JSX.Element {
  const [state, dispatch] = useReducer(figureReducer, undefined, () =>
    initialFigureState(),
  );
  const [bitmaps, setBitmaps] = useState<Map<string, ImageBitmap>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef<FigureState>(state);
  stateRef.current = state;

  const figure = useMemo(
    () =>
      deriveFigure(state, {
        canvas: {
          widthPx: FIGURE_PX_W,
          heightPx: FIGURE_PX_H,
          background: CANVAS_BG,
        },
        grid: { gutterPx: GUTTER_PX, gutterColor: GUTTER_COLOR },
      }),
    [state],
  );

  const placedIds = useMemo(
    () => new Set(state.placements.values()),
    [state.placements],
  );

  const onAddImagesClick = useCallback(async (): Promise<void> => {
    setError(null);
    let result;
    try {
      result = await window.api.openImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    if (result.canceled) return;
    for (const f of result.files) {
      let bm: ImageBitmap;
      try {
        bm = await decodeImageBytes(f.bytes, f.mime);
      } catch (err) {
        setError(
          `decode failed for ${f.filePath}: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }
      const item: ImagePoolItem = {
        id: newImageId(),
        filename: basename(f.filePath),
        filePath: f.filePath,
        mime: f.mime,
        width: bm.width,
        height: bm.height,
      };
      setBitmaps((prev) => {
        const next = new Map(prev);
        next.set(item.id, bm);
        return next;
      });
      dispatch(addToPool(item));
    }
  }, []);

  const onDrop = useCallback((ev: DropEvent): void => {
    const action = dispatchDrop(stateRef.current, ev);
    if (action !== null) dispatch(action);
  }, []);

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        height: "100vh",
        margin: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          padding: 8,
          borderBottom: "1px solid #DDD",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 16 }}>Mosaic Builder</h1>
        <ExportButton figure={figure} images={bitmaps} />
        {error !== null && (
          <span style={{ color: "#B00", fontSize: 12 }}>{error}</span>
        )}
      </header>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Tray
          pool={state.pool}
          bitmaps={bitmaps}
          placedIds={placedIds}
          onAddImagesClick={() => {
            void onAddImagesClick();
          }}
        />
        <section
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            padding: 16,
            overflow: "auto",
          }}
        >
          <div
            style={{
              position: "relative",
              width: CANVAS_CSS_W,
              height: CANVAS_CSS_H,
            }}
          >
            <EditorCanvas figure={figure} images={bitmaps} />
            <GridCells
              state={state}
              figurePxW={FIGURE_PX_W}
              figurePxH={FIGURE_PX_H}
              cssW={CANVAS_CSS_W}
              cssH={CANVAS_CSS_H}
              gutterPx={GUTTER_PX}
              onDrop={onDrop}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
