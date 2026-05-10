import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorCanvas } from "./components/Canvas/EditorCanvas";
import { ExportMenu } from "./components/Toolbar/ExportMenu";
import { GridControls } from "./components/Toolbar/GridControls";
import { MergeControls } from "./components/Toolbar/MergeControls";
import { PanelControls } from "./components/Toolbar/PanelControls";
import {
  AnnotationToolbar,
  type Tool,
} from "./components/Toolbar/AnnotationToolbar";
import { AnnotationInteractionLayer } from "./components/Annotations/AnnotationInteractionLayer";
import { CalibrationModal } from "./components/Annotations/CalibrationModal";
import { RelinkModal } from "./components/Modals/RelinkModal";
import { CropImageModal } from "./components/Modals/CropImageModal";
import { Tray } from "./components/Sidebar/Tray";
import { PropertiesPanel } from "./components/Properties/PropertiesPanel";
import { GridCells, type DropEvent } from "./components/Grid/GridCells";
import { PanelInteractionLayer } from "./components/Grid/PanelInteractionLayer";
import {
  type PanelInteraction,
  editingIdOf,
  focusedIdOf,
  selectedIdOf,
} from "./model/panel-interaction";
import { initialFigureState, type FigureState } from "./model/figure-state";
import {
  type DefaultSymbolStyle,
  initialDefaultSymbolStyle,
} from "./model/default-symbol-style";
import {
  addToPool,
  resizeGrid,
  setGutterPx,
  setGutterColor,
  setOuterGutter,
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
  unplacePanel,
  restorePanelAt,
  setTrackWeightAction,
  resizePanelFreeformAction,
  resetToUniformGridAction,
} from "./model/figure-actions";
import { useHistoryReducer } from "./state/use-history-reducer";
import { applyLoadedProject } from "./state/load-project";
import { emptySelection, singleSelectedId } from "./state/anno-selection";
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

const CANVAS_BG = "#FFFFFF";
const CANVAS_CSS_W = 800;
const CANVAS_CSS_H = 600;
const FIGURE_PX_W = 800;
const FIGURE_PX_H = 600;

function basename(p: string): string {
  const ix = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return ix >= 0 ? p.slice(ix + 1) : p;
}

export function App(): JSX.Element {
  const [state, dispatch, history] = useHistoryReducer(initialFigureState());
  const [bitmaps, setBitmaps] = useState<Map<string, ImageBitmap>>(new Map());
  const toasts = useToasts(5000);
  const [panelInteraction, setPanelInteraction] =
    useState<PanelInteraction>(null);
  const focusedPanelId = focusedIdOf(panelInteraction);
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [defaultSymbolStyle, setDefaultSymbolStyle] =
    useState<DefaultSymbolStyle>(initialDefaultSymbolStyle);
  const [spacebarHeld, setSpacebarHeld] = useState<boolean>(false);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [missingImages, setMissingImages] = useState<
    { imageId: string; filename: string; attemptedPaths: string[] }[]
  >([]);
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<
    ReadonlySet<string>
  >(() => emptySelection());
  const [calibratingImageId, setCalibratingImageId] = useState<string | null>(
    null,
  );
  const [croppingPanelId, setCroppingPanelId] = useState<string | null>(null);
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

  const onDrop = useCallback(
    (ev: DropEvent): void => {
      const action = dispatchDrop(stateRef.current, ev);
      if (action !== null) dispatch(action);
    },
    [dispatch],
  );

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
  // Single-selected anno is only meaningful for the legacy properties-panel
  // path. With > 1 in the set, PropertiesPanel routes to MultiAnnoForm
  // instead and reads `selectedAnnotationIds` directly.
  const singleSelectedAnnoId = singleSelectedId(selectedAnnotationIds);
  const selectedAnno = useMemo(
    () =>
      singleSelectedAnnoId === null
        ? undefined
        : state.annotations.find((a) => a.id === singleSelectedAnnoId),
    [state.annotations, singleSelectedAnnoId],
  );
  // Annotations for the multi-select form. Computed only when the set has
  // > 1 entry; otherwise we leave it undefined so PropertiesPanel falls
  // through to the single-select / global routing.
  const selectedAnnos = useMemo(() => {
    if (selectedAnnotationIds.size <= 1) return undefined;
    return state.annotations.filter((a) => selectedAnnotationIds.has(a.id));
  }, [state.annotations, selectedAnnotationIds]);

  // Spec 08: derived letters carry id `letter:<panelId>`. They aren't in
  // `state.annotations`, so the parent extracts the bound panel id and
  // passes it as a separate routing prop to PropertiesPanel.
  const selectedLetterPanelId = useMemo(() => {
    if (singleSelectedAnnoId === null) return undefined;
    if (!singleSelectedAnnoId.startsWith("letter:")) return undefined;
    return singleSelectedAnnoId.slice("letter:".length);
  }, [singleSelectedAnnoId]);

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

  const onPanelSingleClick = useCallback(
    (panelId: string) => {
      // Single-click while already editing this same panel: no-op (stay
      // in editing so the user doesn't lose pan/zoom state mid-drag).
      if (
        panelInteraction !== null &&
        panelInteraction.mode === "editing" &&
        panelInteraction.panelId === panelId
      ) {
        return;
      }
      // Same shape for image and empty panels — empty panels can't drag
      // anyway (GridCells gates on `occupied`), but they still need
      // "selected" focus for the Unmerge action and properties panel.
      setPanelInteraction({ mode: "selected", panelId });
    },
    [panelInteraction],
  );

  const onPanelDoubleClick = useCallback((panelId: string) => {
    const panel = stateRef.current.panels.find((p) => p.id === panelId);
    if (panel === undefined || panel.imageId === undefined) return;
    setPanelInteraction({ mode: "editing", panelId });
  }, []);

  const onHoleClick = useCallback(
    (row: number, col: number) => {
      dispatch(restorePanelAt(row, col));
      // Drop merge selection — clicking a hole shouldn't leave behind
      // ghost shift-click marks on neighboring cells.
      selection.clear();
    },
    [dispatch, selection],
  );

  const onSetFit = useCallback(
    (fit: "contain" | "cover" | "stretch") => {
      if (selectedImagePanel === undefined) return;
      dispatch(setPanelFit(selectedImagePanel.id, fit));
    },
    [selectedImagePanel, dispatch],
  );

  const onEscape = useCallback(() => {
    selection.clear();
    setPanelInteraction(null);
    setSelectedAnnotationIds(emptySelection());
    setActiveTool("select");
  }, [selection]);

  const onDeleteAnnotation = useCallback(() => {
    if (selectedAnnotationIds.size === 0) return;
    if (annotationEditing) return; // an inline editor owns the keystroke
    if (selectedAnnotationIds.size === 1) {
      const id = singleSelectedId(selectedAnnotationIds);
      if (id !== null) dispatch(removeAnnotation(id));
    } else {
      dispatch({
        type: "BULK_REMOVE_ANNOS",
        ids: Array.from(selectedAnnotationIds),
      });
    }
    setSelectedAnnotationIds(emptySelection());
  }, [selectedAnnotationIds, annotationEditing, dispatch]);

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

  // Hold-spacebar = temporary Select mode. Release returns to the prior tool.
  // We don't steal Space from form fields (text input, scalebar number, etc.);
  // a window blur clears the held state defensively in case keyup is missed.
  useEffect(() => {
    function isFormElementFocused(): boolean {
      const el = document.activeElement;
      if (el === null) return false;
      if (el instanceof HTMLInputElement) return true;
      if (el instanceof HTMLTextAreaElement) return true;
      if (el instanceof HTMLSelectElement) return true;
      if (el instanceof HTMLElement && el.isContentEditable) return true;
      return false;
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.code !== "Space") return;
      if (isFormElementFocused()) return;
      if (e.repeat) return;
      e.preventDefault();
      setSpacebarHeld(true);
    }
    function onKeyUp(e: KeyboardEvent): void {
      if (e.code !== "Space") return;
      setSpacebarHeld(false);
    }
    function onBlur(): void {
      setSpacebarHeld(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const effectiveTool: Tool = spacebarHeld ? "select" : activeTool;

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

  const onCrop = useCallback(() => {
    if (selectedImagePanel?.imageId === undefined) return;
    setCroppingPanelId(selectedImagePanel.id);
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
      defaultName:
        projectPath !== null ? basename(projectPath) : "untitled.mosaic",
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
    setPanelInteraction(null);
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
    setPanelInteraction(null);
    setSelectedAnnotationIds(emptySelection());
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
      toasts.push({
        kind: "info",
        message: "Use Export → JPEG in the toolbar",
      }),
    onExportTiff: () =>
      toasts.push({
        kind: "info",
        message: "Use Export → TIFF in the toolbar",
      }),
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
        height: "100vh",
        margin: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className="app-bar">
        <div className="app-bar-left">
          <h1 className="app-title">Mosaic Builder</h1>
          <span className="toolbar-divider" aria-hidden="true" />
          <button
            type="button"
            className="btn"
            onClick={() => {
              void onOpenProject();
            }}
            data-testid="open-project"
          >
            Open…
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              void onSaveProject();
            }}
            data-testid="save-project"
          >
            Save
          </button>
        </div>
        <div className="app-bar-right">
          <ExportMenu
            figure={figure}
            images={bitmaps}
            pool={imagesByIdMemo}
            poolList={state.pool}
            rows={state.rows}
            cols={state.cols}
            gutterPx={state.gutterPx}
          />
        </div>
      </div>
      <div className="tool-ribbon">
        <ToolGroup label="Grid">
          <GridControls
            rows={state.rows}
            cols={state.cols}
            gutterPx={state.gutterPx}
            gutterColor={state.gutterColor}
            outerGutter={state.outerGutter}
            onChangeRows={(rows) => dispatch(resizeGrid(rows, state.cols))}
            onChangeCols={(cols) => dispatch(resizeGrid(state.rows, cols))}
            onChangeGutterPx={(px) => dispatch(setGutterPx(px))}
            onChangeGutterColor={(c) => dispatch(setGutterColor(c))}
            onChangeOuterGutter={(v) => dispatch(setOuterGutter(v))}
            layoutKind={state.layout.kind}
            onResetUniform={() => {
              dispatch(resetToUniformGridAction());
              history.commit();
            }}
          />
        </ToolGroup>
        <ToolGroup label="Selection">
          <MergeControls
            canMerge={canMerge}
            canUnmerge={canUnmerge}
            onMerge={onMerge}
            onUnmerge={onUnmerge}
          />
        </ToolGroup>
        <ToolGroup label="Panel">
          <PanelControls
            transform={selectedImagePanel?.transform ?? null}
            onSetFit={onSetFit}
            onRotate90={onRotate90}
            onFlipH={onFlipH}
            onFlipV={onFlipV}
            onReset={onResetTransform}
            onCalibrate={onCalibrate}
          />
        </ToolGroup>
        <ToolGroup label="Annotate">
          <AnnotationToolbar
            active={activeTool}
            onChange={setActiveTool}
            lettersEnabled={state.globalStyle.letters.enabled}
            onToggleLetters={() =>
              dispatch(setLettersEnabled(!state.globalStyle.letters.enabled))
            }
          />
        </ToolGroup>
      </div>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Tray
          pool={state.pool}
          bitmaps={bitmaps}
          placedIds={placedIds}
          onAddImagesClick={() => {
            void onAddImagesClick();
          }}
          onUnplacePanel={(panelId) => dispatch(unplacePanel(panelId))}
        />
        <section
          onClick={(e) => {
            if (e.target === e.currentTarget) setPanelInteraction(null);
          }}
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            padding: 24,
            overflow: "auto",
            background: "var(--c-surface-sunken)",
          }}
        >
          <div
            style={{
              position: "relative",
              width: CANVAS_CSS_W,
              height: CANVAS_CSS_H,
              boxShadow: "var(--sh-md)",
            }}
          >
            <EditorCanvas
              figure={figure}
              images={bitmaps}
              pool={imagesByIdMemo}
            />
            <GridCells
              state={state}
              figurePxW={FIGURE_PX_W}
              figurePxH={FIGURE_PX_H}
              cssW={CANVAS_CSS_W}
              cssH={CANVAS_CSS_H}
              onDrop={onDrop}
              selection={selection.selected}
              onCellShiftClick={selection.toggle}
              panelInteraction={panelInteraction}
              onPanelClick={onPanelSingleClick}
              onPanelDoubleClick={onPanelDoubleClick}
              onHoleClick={onHoleClick}
              onPanelCropBadgeClick={setCroppingPanelId}
              onTrackWeightChange={(axis, index, weight) => {
                dispatch(setTrackWeightAction(axis, index, weight));
                history.commit();
              }}
            />
            {editingIdOf(panelInteraction) !== null &&
              selectedImagePanel !== undefined &&
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
                  onResizeFreeform={(corner, dx, dy) => {
                    dispatch(
                      resizePanelFreeformAction(
                        selectedImagePanel.id,
                        corner,
                        dx,
                        dy,
                        { widthPx: FIGURE_PX_W, heightPx: FIGURE_PX_H },
                      ),
                    );
                    // history.commit() runs on pointer-up via onCommit.
                  }}
                />
              )}
            <AnnotationInteractionLayer
              activeTool={effectiveTool}
              defaultSymbolStyle={defaultSymbolStyle}
              figure={figure}
              panelRectsById={panelRectsByIdMemo}
              imagesById={imagesByIdMemo}
              cssW={CANVAS_CSS_W}
              cssH={CANVAS_CSS_H}
              figurePxW={FIGURE_PX_W}
              figurePxH={FIGURE_PX_H}
              selectedAnnotationIds={selectedAnnotationIds}
              onSelectionChange={setSelectedAnnotationIds}
              onEditingChange={setAnnotationEditing}
              dispatch={dispatch}
              onTrayDrop={onDrop}
              onPanelDoubleClick={onPanelDoubleClick}
              onPanelClick={onPanelSingleClick}
              {...(() => {
                const sid = selectedIdOf(panelInteraction);
                return sid !== null ? { selectedPanelId: sid } : {};
              })()}
              {...(editingIdOf(panelInteraction) !== null &&
              focusedPanelRect !== null
                ? { editingPanelRect: focusedPanelRect }
                : {})}
            />
            {spacebarHeld && activeTool !== "select" && (
              <div
                data-testid="select-mode-chip"
                className="select-mode-chip"
                role="status"
                aria-live="polite"
              >
                SELECT MODE (release ␣)
              </div>
            )}
          </div>
        </section>
        <PropertiesPanel
          state={state}
          focusedPanel={selectedImagePanel}
          selectedAnno={selectedAnno}
          {...(selectedLetterPanelId !== undefined
            ? { selectedLetterPanelId }
            : {})}
          {...(selectedAnnos !== undefined ? { selectedAnnos } : {})}
          onMultiBulkRemove={() => setSelectedAnnotationIds(emptySelection())}
          selectedAnnotationIds={selectedAnnotationIds}
          onSelectionChange={setSelectedAnnotationIds}
          activeTool={activeTool}
          defaultSymbolStyle={defaultSymbolStyle}
          onDefaultSymbolStyleChange={setDefaultSymbolStyle}
          dispatch={dispatch}
          commit={fieldCommit}
          onCalibrate={onCalibrate}
          onCrop={onCrop}
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
      {(() => {
        if (croppingPanelId === null) return null;
        const cp = state.panels.find((p) => p.id === croppingPanelId);
        if (
          cp === undefined ||
          cp.imageId === undefined ||
          cp.transform === undefined
        ) {
          return null;
        }
        const bm = bitmaps.get(cp.imageId);
        if (bm === undefined) return null;
        const rect = panelRectsByIdMemo.get(cp.id);
        const aspect = rect !== undefined && rect.h > 0 ? rect.w / rect.h : 1;
        return (
          <CropImageModal
            panelId={cp.id}
            bitmap={bm}
            initialCrop={cp.transform.crop}
            transform={cp.transform}
            panelAspect={aspect}
            onClose={() => setCroppingPanelId(null)}
            dispatch={dispatch}
          />
        );
      })()}
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

function ToolGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="tool-group">
      <span className="tool-group-label">{label}</span>
      <div className="tool-group-body">{children}</div>
    </div>
  );
}
