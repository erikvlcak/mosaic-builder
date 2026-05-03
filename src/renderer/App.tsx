import { useCallback, useMemo, useRef, useState } from "react";
import { EditorCanvas } from "./components/Canvas/EditorCanvas";
import { ExportMenu } from "./components/Toolbar/ExportMenu";
import { GridControls } from "./components/Toolbar/GridControls";
import { MergeControls } from "./components/Toolbar/MergeControls";
import { PanelControls } from "./components/Toolbar/PanelControls";
import { AnnotationToolbar, type Tool } from "./components/Toolbar/AnnotationToolbar";
import { AnnotationInteractionLayer } from "./components/Annotations/AnnotationInteractionLayer";
import { CalibrationModal } from "./components/Annotations/CalibrationModal";
import { RelinkModal } from "./components/Modals/RelinkModal";
import { Tray } from "./components/Sidebar/Tray";
import { PropertiesPanel } from "./components/Properties/PropertiesPanel";
import { GridCells, type DropEvent } from "./components/Grid/GridCells";
import { PanelInteractionLayer } from "./components/Grid/PanelInteractionLayer";
import {
  initialFigureState,
  type FigureState,
} from "./model/figure-state";
import {
  addToPool,
  resizeGrid,
  setGutterPx,
  setGutterColor,
  mergeCells,
  unmergePanelAction,
  setPanelFit,
  rotatePanel90,
  flipPanelH,
  flipPanelV,
  resetPanelTransform,
  removeAnnotation,
  setLettersEnabled,
  resetFigureAction,
} from "./model/figure-actions";
import { useHistoryReducer } from "./state/use-history-reducer";
import { applyLoadedProject } from "./state/load-project";
import { newImageId, type ImagePoolItem } from "./model/pool";
import { deriveFigure } from "./model/figure-derivations";
import { computePanelRects, type PanelRect } from "./render/coords";
import { decodeImageBytes } from "./image/decode-bytes";
import { dispatchDrop } from "./dnd/dispatch-drop";
import { canMergeSelection } from "./model/merge";
import { useMergeSelection } from "./hooks/useMergeSelection";
import { useFieldCommit } from "./hooks/useFieldCommit";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useMenuEvents } from "./hooks/useMenuEvents";
import { toMosaicFile } from "./model/serialize";
import { APP_VERSION } from "./app-version";
import { useToasts } from "./hooks/useToasts";
import { ToastTray } from "./components/Toasts/ToastTray";

const FIGURE_PX_W = 800;
const FIGURE_PX_H = 600;
const CANVAS_BG = "#FFFFFF";
const CANVAS_CSS_W = 800;
const CANVAS_CSS_H = 600;

function basename(p: string): string {
  const ix = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return ix >= 0 ? p.slice(ix + 1) : p;
}

export function App(): JSX.Element {
  const [state, dispatch, history] = useHistoryReducer(initialFigureState());
  const [bitmaps, setBitmaps] = useState<Map<string, ImageBitmap>>(new Map());
  const toasts = useToasts(5000);
  const [focusedPanelId, setFocusedPanelId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [missingImages, setMissingImages] = useState<
    { imageId: string; filename: string; attemptedPaths: string[] }[]
  >([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [calibratingImageId, setCalibratingImageId] = useState<string | null>(null);
  const [annotationEditing, setAnnotationEditing] = useState<boolean>(false);
  const stateRef = useRef<FigureState>(state);
  stateRef.current = state;

  const selection = useMergeSelection();

  const figure = useMemo(
    () =>
      deriveFigure(state, {
        canvas: {
          widthPx: FIGURE_PX_W,
          heightPx: FIGURE_PX_H,
          background: CANVAS_BG,
        },
      }),
    [state],
  );

  const placedIds = useMemo(
    () =>
      new Set(
        state.panels
          .map((p) => p.imageId)
          .filter((x): x is string => x !== undefined),
      ),
    [state.panels],
  );

  const onAddImagesClick = useCallback(async (): Promise<void> => {
    let result;
    try {
      result = await window.api.openImages();
    } catch (err) {
      toasts.push({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    if (result.canceled) return;
    for (const f of result.files) {
      let decoded;
      try {
        decoded = await decodeImageBytes(f.bytes, f.mime);
      } catch (err) {
        toasts.push({
          kind: "error",
          message: `decode failed for ${f.filePath}: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }
      const { bitmap, bitDepth, calibration } = decoded;
      const item: ImagePoolItem = {
        id: newImageId(),
        filename: basename(f.filePath),
        filePath: f.filePath,
        mime: f.mime,
        width: bitmap.width,
        height: bitmap.height,
        bitDepth,
        ...(calibration !== undefined ? { calibration } : {}),
      };
      setBitmaps((prev) => {
        const next = new Map(prev);
        next.set(item.id, bitmap);
        return next;
      });
      dispatch(addToPool(item));
    }
  }, [dispatch, toasts]);

  const onDrop = useCallback((ev: DropEvent): void => {
    const action = dispatchDrop(stateRef.current, ev);
    if (action !== null) dispatch(action);
  }, [dispatch]);

  const onMerge = useCallback(() => {
    const cells = selection.asCoords();
    const check = canMergeSelection(stateRef.current.panels, cells);
    if (!check.ok) return;
    dispatch(mergeCells(cells));
    selection.clear();
  }, [selection, dispatch]);

  const onUnmerge = useCallback(() => {
    if (focusedPanelId === null) return;
    const p = stateRef.current.panels.find((x) => x.id === focusedPanelId);
    if (p === undefined) return;
    if (p.rowSpan === 1 && p.colSpan === 1) return;
    dispatch(unmergePanelAction(focusedPanelId));
  }, [focusedPanelId, dispatch]);

  const focusedPanel = useMemo(
    () =>
      focusedPanelId !== null
        ? state.panels.find((p) => p.id === focusedPanelId)
        : undefined,
    [state.panels, focusedPanelId],
  );

  const selectedImagePanel =
    focusedPanel?.imageId !== undefined ? focusedPanel : undefined;

  const fieldCommit = useFieldCommit(history.commit, 400);
  const selectedAnno = useMemo(
    () =>
      selectedAnnotationId === null
        ? undefined
        : state.annotations.find((a) => a.id === selectedAnnotationId),
    [state.annotations, selectedAnnotationId],
  );

  const onRotate90 = useCallback(() => {
    if (selectedImagePanel === undefined) return;
    dispatch(rotatePanel90(selectedImagePanel.id));
  }, [selectedImagePanel, dispatch]);

  const onFlipH = useCallback(() => {
    if (selectedImagePanel === undefined) return;
    dispatch(flipPanelH(selectedImagePanel.id));
  }, [selectedImagePanel, dispatch]);

  const onFlipV = useCallback(() => {
    if (selectedImagePanel === undefined) return;
    dispatch(flipPanelV(selectedImagePanel.id));
  }, [selectedImagePanel, dispatch]);

  const onResetTransform = useCallback(() => {
    if (selectedImagePanel === undefined) return;
    dispatch(resetPanelTransform(selectedImagePanel.id));
  }, [selectedImagePanel, dispatch]);

  const onSetFit = useCallback(
    (fit: "contain" | "cover" | "stretch") => {
      if (selectedImagePanel === undefined) return;
      dispatch(setPanelFit(selectedImagePanel.id, fit));
    },
    [selectedImagePanel, dispatch],
  );

  const onEscape = useCallback(() => {
    selection.clear();
    setFocusedPanelId(null);
    setSelectedAnnotationId(null);
    setActiveTool("select");
  }, [selection]);

  const onDeleteAnnotation = useCallback(() => {
    if (selectedAnnotationId === null) return;
    if (annotationEditing) return; // an inline editor owns the keystroke
    dispatch(removeAnnotation(selectedAnnotationId));
    setSelectedAnnotationId(null);
  }, [selectedAnnotationId, annotationEditing, dispatch]);

  useKeyboardShortcuts({
    onMerge,
    onUnmerge,
    onEscape,
    onRotate90,
    onFlipH,
    onFlipV,
    onResetTransform,
    onDeleteAnnotation,
    onUndo: history.undo,
    onRedo: history.redo,
  });

  const canMerge = useMemo(() => {
    const check = canMergeSelection(state.panels, selection.asCoords());
    return check.ok;
  }, [state.panels, selection]);

  const canUnmerge =
    focusedPanel !== undefined &&
    (focusedPanel.rowSpan > 1 || focusedPanel.colSpan > 1);

  // Compute panel rects once (used by the focused-panel rect AND the
  // annotation interaction layer's hit/click routing).
  const panelRectsByIdMemo = useMemo<Map<string, PanelRect>>(() => {
    const rects = computePanelRects(figure);
    const map = new Map<string, PanelRect>();
    for (let i = 0; i < figure.panels.length; i++) {
      const p = figure.panels[i];
      const r = rects[i];
      if (p?.panelId !== undefined && r !== undefined) {
        map.set(p.panelId, r);
      }
    }
    return map;
  }, [figure]);

  const imagesByIdMemo = useMemo<Map<string, ImagePoolItem>>(() => {
    const m = new Map<string, ImagePoolItem>();
    for (const item of state.pool) m.set(item.id, item);
    return m;
  }, [state.pool]);

  // Compute the focused panel's rect once for the interaction layer.
  const focusedPanelRect = useMemo(() => {
    if (selectedImagePanel === undefined) return null;
    return panelRectsByIdMemo.get(selectedImagePanel.id) ?? null;
  }, [panelRectsByIdMemo, selectedImagePanel]);

  const focusedBitmap =
    selectedImagePanel?.imageId !== undefined
      ? bitmaps.get(selectedImagePanel.imageId)
      : undefined;

  const onCalibrate = useCallback(() => {
    if (selectedImagePanel?.imageId === undefined) return;
    setCalibratingImageId(selectedImagePanel.imageId);
  }, [selectedImagePanel]);

  const onSaveProject = useCallback(async () => {
    const file = toMosaicFile({
      state,
      canvas: {
        widthPx: FIGURE_PX_W,
        heightPx: FIGURE_PX_H,
        background: CANVAS_BG,
      },
      mosaicPath: projectPath ?? "untitled.mosaic",
      appVersion: APP_VERSION,
    });
    const r = await window.api.saveProject({
      file,
      defaultName: projectPath !== null ? basename(projectPath) : "untitled.mosaic",
    });
    if (!r.ok) {
      if (r.reason !== "canceled") {
        toasts.push({
          kind: "error",
          message: `Save failed: ${r.message ?? r.reason}`,
        });
      }
      return;
    }
    setProjectPath(r.filePath);
    toasts.push({ kind: "success", message: "Project saved" });
  }, [state, projectPath, toasts]);

  const onOpenProject = useCallback(async () => {
    const r = await window.api.loadProject();
    if (!r.ok) {
      if (r.reason !== "canceled") {
        toasts.push({
          kind: "error",
          message: `Open failed: ${r.message ?? r.reason}`,
        });
      }
      return;
    }
    const outcome = await applyLoadedProject(r, dispatch);
    setBitmaps(outcome.bitmaps);
    setProjectPath(r.filePath);
    setMissingImages(r.missing);
    if (outcome.decodeFailures.length > 0) {
      toasts.push({
        kind: "error",
        message: `Some images failed to decode: ${outcome.decodeFailures
          .map((f) => f.imageId)
          .join(", ")}`,
      });
    }
    toasts.push({ kind: "success", message: "Project loaded" });
  }, [dispatch, toasts]);

  const onNew = useCallback(() => {
    dispatch(resetFigureAction());
    setBitmaps(new Map());
    setProjectPath(null);
    setFocusedPanelId(null);
    setSelectedAnnotationId(null);
    toasts.push({ kind: "info", message: "New figure" });
  }, [dispatch, toasts]);

  const onSaveAs = useCallback(async () => {
    setProjectPath(null);
    await onSaveProject();
  }, [onSaveProject]);

  useMenuEvents({
    onNew,
    onOpen: onOpenProject,
    onSave: onSaveProject,
    onSaveAs,
    onExportPng: () =>
      toasts.push({ kind: "info", message: "Use Export → PNG in the toolbar" }),
    onExportJpeg: () =>
      toasts.push({ kind: "info", message: "Use Export → JPEG in the toolbar" }),
    onExportTiff: () =>
      toasts.push({ kind: "info", message: "Use Export → TIFF in the toolbar" }),
    onExportPdf: () =>
      toasts.push({ kind: "info", message: "Use Export → PDF in the toolbar" }),
    onUndo: history.undo,
    onRedo: history.redo,
  });

  const calibratingBitmap =
    calibratingImageId !== null ? bitmaps.get(calibratingImageId) : undefined;

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
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 16 }}>Mosaic Builder</h1>
        <ExportMenu figure={figure} images={bitmaps} pool={imagesByIdMemo} />
        <button
          type="button"
          onClick={() => {
            void onOpenProject();
          }}
          data-testid="open-project"
        >
          Open…
        </button>
        <button
          type="button"
          onClick={() => {
            void onSaveProject();
          }}
          data-testid="save-project"
        >
          Save
        </button>
        <GridControls
          rows={state.rows}
          cols={state.cols}
          gutterPx={state.gutterPx}
          gutterColor={state.gutterColor}
          onChangeRows={(rows) => dispatch(resizeGrid(rows, state.cols))}
          onChangeCols={(cols) => dispatch(resizeGrid(state.rows, cols))}
          onChangeGutterPx={(px) => dispatch(setGutterPx(px))}
          onChangeGutterColor={(c) => dispatch(setGutterColor(c))}
        />
        <MergeControls
          canMerge={canMerge}
          canUnmerge={canUnmerge}
          onMerge={onMerge}
          onUnmerge={onUnmerge}
        />
        <PanelControls
          transform={selectedImagePanel?.transform ?? null}
          onSetFit={onSetFit}
          onRotate90={onRotate90}
          onFlipH={onFlipH}
          onFlipV={onFlipV}
          onReset={onResetTransform}
          onCalibrate={onCalibrate}
        />
        <AnnotationToolbar
          active={activeTool}
          onChange={setActiveTool}
          lettersEnabled={state.globalStyle.letters.enabled}
          onToggleLetters={() =>
            dispatch(setLettersEnabled(!state.globalStyle.letters.enabled))
          }
        />
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
              onDrop={onDrop}
              selection={selection.selected}
              onCellShiftClick={selection.toggle}
              focusedPanelId={focusedPanelId}
              onPanelClick={setFocusedPanelId}
            />
            {selectedImagePanel !== undefined &&
              focusedPanelRect !== null &&
              focusedBitmap !== undefined &&
              selectedImagePanel.transform !== undefined && (
                <PanelInteractionLayer
                  panelId={selectedImagePanel.id}
                  panelRect={focusedPanelRect}
                  transform={selectedImagePanel.transform}
                  bitmap={focusedBitmap}
                  figurePxW={FIGURE_PX_W}
                  figurePxH={FIGURE_PX_H}
                  cssW={CANVAS_CSS_W}
                  cssH={CANVAS_CSS_H}
                  dispatch={dispatch}
                  onCommit={history.commit}
                />
              )}
            <AnnotationInteractionLayer
              activeTool={activeTool}
              figure={figure}
              panelRectsById={panelRectsByIdMemo}
              imagesById={imagesByIdMemo}
              cssW={CANVAS_CSS_W}
              cssH={CANVAS_CSS_H}
              figurePxW={FIGURE_PX_W}
              figurePxH={FIGURE_PX_H}
              selectedAnnotationId={selectedAnnotationId}
              onSelectAnnotation={setSelectedAnnotationId}
              onEditingChange={setAnnotationEditing}
              dispatch={dispatch}
            />
          </div>
        </section>
        <PropertiesPanel
          state={state}
          focusedPanel={selectedImagePanel}
          selectedAnno={selectedAnno}
          dispatch={dispatch}
          commit={fieldCommit}
          onCalibrate={onCalibrate}
        />
      </div>
      {calibratingImageId !== null && calibratingBitmap !== undefined && (
        <CalibrationModal
          bitmap={calibratingBitmap}
          imageId={calibratingImageId}
          onClose={() => setCalibratingImageId(null)}
          dispatch={dispatch}
        />
      )}
      {missingImages.length > 0 && (
        <RelinkModal
          missing={missingImages}
          dispatch={dispatch}
          onClose={() => setMissingImages([])}
          onRelinked={(newBitmaps, stillMissing) => {
            setBitmaps((prev) => {
              const next = new Map(prev);
              for (const [k, v] of newBitmaps) next.set(k, v);
              return next;
            });
            setMissingImages(stillMissing);
          }}
        />
      )}
      <ToastTray toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </main>
  );
}
