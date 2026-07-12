import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorCanvas } from "./components/Canvas/EditorCanvas";
import { ExportMenu } from "./components/Toolbar/ExportMenu";
import { GridControls } from "./components/Toolbar/GridControls";
import { MergeControls } from "./components/Toolbar/MergeControls";
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
import { HintBar, type HintContext } from "./components/StatusHints/HintBar";
import { GridCells, type DropEvent } from "./components/Grid/GridCells";
import { FrameChrome } from "./components/Grid/FrameChrome";
import { SelectedPanelHandles } from "./components/Grid/SelectedPanelHandles";
import type { DragPayload } from "./dnd/drag-payload";
import {
  type PanelInteraction,
  editingIdOf,
  focusedIdOf,
  selectedIdOf,
} from "./model/panel-interaction";
import {
  initialFigureState,
  figureReducer,
  type FigureState,
} from "./model/figure-state";
import {
  type DefaultSymbolStyle,
  initialDefaultSymbolStyle,
} from "./model/default-symbol-style";
import {
  type DefaultTextStyle,
  initialDefaultTextStyle,
} from "./model/default-text-style";
import {
  type DefaultScalebarStyle,
  initialDefaultScalebarStyle,
} from "./model/default-scalebar-style";
import {
  addToPool,
  resizeGrid,
  setGutterPx,
  setGutterColor,
  setOuterGutter,
  mergeCells,
  unmergePanelAction,
  rotatePanel90,
  flipPanelH,
  flipPanelV,
  resetPanelTransform,
  removeAnnotation,
  setLettersEnabled,
  resetFigureAction,
  placeIntoPanel,
  restorePanelAt,
  setTrackWeightAction,
  resizePanelFreeformAction,
  resetToUniformGridAction,
  relinkPoolImage,
  removeFromPool,
  addAnnotation,
  unplacePanel,
} from "./model/figure-actions";
import type { ScaleBarAnnotation } from "./model/annotations";
import { useHistoryReducer } from "./state/use-history-reducer";
import { isDirty } from "./state/dirty";
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
import { useFigureExport } from "./hooks/useFigureExport";
import { toMosaicFile } from "./model/serialize";
import { APP_VERSION } from "./app-version";
import { useToasts } from "./hooks/useToasts";
import { ToastTray } from "./components/Toasts/ToastTray";
import { useCanvasZoom } from "./hooks/useCanvasZoom";
import {
  InteractionProvider,
  useSpaceHeldState,
} from "./interaction/InteractionContext";
import { useViewportGestures } from "./interaction/useViewportGestures";
import {
  useFrameGestures,
  type FrameTarget,
} from "./interaction/useFrameGestures";
import { resolveEscape } from "./interaction/resolve";
import { ZoomControls } from "./components/Toolbar/ZoomControls";
import { computeCanvasDims, placedPoolImages } from "./model/canvas-dims";
import { ThemeToggle } from "./components/Toolbar/ThemeToggle";
import { useTheme } from "./theme/useTheme";

const CANVAS_BG = "#FFFFFF";
const FIGURE_PX_W = 800;
const FIGURE_PX_H = 600;
// Matches the interaction layer's Z_SCALEBAR — scale bars sit above other
// annotations so they can't be hidden behind them.
const Z_SCALEBAR = 10;

function basename(p: string): string {
  const ix = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return ix >= 0 ? p.slice(ix + 1) : p;
}

export function App(): JSX.Element {
  const [state, dispatch, history] = useHistoryReducer(initialFigureState());
  const [bitmaps, setBitmaps] = useState<Map<string, ImageBitmap>>(new Map());
  // Drag-and-drop preview state (UI-only — not in FigureState, not undoable).
  // Lifted to App so the GridCells outline and the DropGhostLayer share truth.
  const [dragSource, setDragSource] = useState<DragPayload | null>(null);
  const [hoverPanelId, setHoverPanelId] = useState<string | null>(null);
  const toasts = useToasts(5000);
  const [panelInteraction, setPanelInteraction] =
    useState<PanelInteraction>(null);
  const focusedPanelId = focusedIdOf(panelInteraction);
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [defaultSymbolStyle, setDefaultSymbolStyle] =
    useState<DefaultSymbolStyle>(initialDefaultSymbolStyle);
  const [defaultTextStyle, setDefaultTextStyle] = useState<DefaultTextStyle>(
    initialDefaultTextStyle,
  );
  const [defaultScalebarStyle, setDefaultScalebarStyle] =
    useState<DefaultScalebarStyle>(initialDefaultScalebarStyle);
  // Space = hand tool (viewport pan override). Owned here, provided to
  // deep handlers via InteractionProvider.
  const spaceHeld = useSpaceHeldState();
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
  // Guided scale-bar flow: the panel awaiting a scale bar once its image is
  // calibrated (set when the scale tool clicks an uncalibrated panel).
  const [pendingScalebarPanelId, setPendingScalebarPanelId] = useState<
    string | null
  >(null);
  const [croppingPanelId, setCroppingPanelId] = useState<string | null>(null);
  const [annotationEditing, setAnnotationEditing] = useState<boolean>(false);
  // Click-to-place: the unplaced tray image armed for placement. Session-only
  // UI state — never promoted into FigureState (mirrors PanelInteraction).
  const [selectedThumbId, setSelectedThumbId] = useState<string | null>(null);
  // JPEG export quality — session-only; shared by the toolbar menu slider and
  // the native-menu JPEG export (which uses the current stored value).
  const [jpegQuality, setJpegQuality] = useState(0.92);
  const stateRef = useRef<FigureState>(state);
  stateRef.current = state;
  const scrollRef = useRef<HTMLElement | null>(null);
  // The cssW × cssH canvas box inside the scroll pane — panel rects are
  // relative to it (frame gestures hit-test against it).
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // sourceScale drives BOTH the editor backing store and the zoom % mapping.
  // Match computeExportScale: the larger per-axis ratio, floored at 1. The
  // model stays a fixed FIGURE_PX_W × FIGURE_PX_H — only the backing store and
  // the on-screen CSS box scale, so exports stay byte-identical.
  //
  // Sized from PLACED images only — an image sitting in the tray must not
  // grow the canvas (the user reads that as it "expanding for no reason").
  const sourceScale = useMemo(() => {
    const placed = new Set(
      state.panels
        .map((p) => p.imageId)
        .filter((x): x is string => x !== undefined),
    );
    const dims = computeCanvasDims(
      placedPoolImages(state.pool, placed),
      state.rows,
      state.cols,
      state.gutterPx,
    );
    return Math.max(1, dims.widthPx / FIGURE_PX_W, dims.heightPx / FIGURE_PX_H);
  }, [state.pool, state.panels, state.rows, state.cols, state.gutterPx]);

  const zoom = useCanvasZoom({
    scrollRef: scrollRef as React.RefObject<HTMLElement>,
    sourceScale,
    modelW: FIGURE_PX_W,
    modelH: FIGURE_PX_H,
  });

  const {
    choice: themeChoice,
    effectiveTheme,
    setChoice: setThemeChoice,
  } = useTheme();

  // Unsaved-changes tracking. `savedStateRef` marks the last clean point (app
  // start / save / load / New); the document is dirty when the live state is a
  // different reference. See state/dirty.ts for why reference identity is the
  // right signal.
  const savedStateRef = useRef<FigureState>(state);
  // Load/New dispatch a reducer action, so the clean state lands on the *next*
  // render — `state` in this closure is still stale. This flag defers the
  // clean-marking to the effect below, which runs after that render settles.
  const markCleanNextRef = useRef(false);
  const dirty = isDirty(state, savedStateRef.current);
  // Save happens synchronously against the current `state`, so it can mark
  // clean immediately.
  const markCleanNow = useCallback(() => {
    savedStateRef.current = stateRef.current;
    window.api.setDirty(false);
  }, []);
  // Keep main's cached dirty flag in sync so its window-close guard is correct,
  // and consume a deferred clean request once the post-dispatch state is live.
  useEffect(() => {
    if (markCleanNextRef.current) {
      markCleanNextRef.current = false;
      savedStateRef.current = state;
      window.api.setDirty(false);
      return;
    }
    window.api.setDirty(dirty);
  }, [state, dirty]);

  const selection = useMergeSelection();

  // Live drag preview: when the cursor is over a valid drop target, compute
  // the state that *would* result if the user released here and use that
  // for figure derivation. The render pipeline then paints the dragged
  // image into its target panel at the same dimensions / transform it
  // would have post-drop, so the user sees the real thing — not a ghost.
  // GridCells still consumes the real `state` (so chrome reflects reality
  // and the dashed invalid-drop outline still works on the hovered panel).
  const previewState = useMemo((): FigureState | null => {
    if (dragSource === null || hoverPanelId === null) return null;
    const action = dispatchDrop(state, {
      from: dragSource,
      targetPanelId: hoverPanelId,
    });
    if (action === null) return null;
    return figureReducer(state, action);
  }, [state, dragSource, hoverPanelId]);

  const figure = useMemo(
    () =>
      deriveFigure(previewState ?? state, {
        canvas: {
          widthPx: FIGURE_PX_W,
          heightPx: FIGURE_PX_H,
          background: CANVAS_BG,
        },
      }),
    [state, previewState],
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
    const failures: string[] = [];
    for (const f of result.files) {
      let decoded;
      try {
        decoded = await decodeImageBytes(f.bytes, f.mime);
      } catch {
        // Collect failures and surface them as ONE toast after the loop, so a
        // batch of 20 corrupt files doesn't push 20 toasts past the viewport.
        failures.push(basename(f.filePath));
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
    if (failures.length > 0) {
      const total = result.files.length;
      const list = failures.slice(0, 3).join(", ");
      const more = failures.length > 3 ? ` +${failures.length - 3} more` : "";
      toasts.push({
        kind: "error",
        message:
          failures.length === 1
            ? `Failed to decode ${failures[0]!}`
            : `${failures.length} of ${total} images failed to decode: ${list}${more}`,
      });
    }
  }, [dispatch, toasts]);

  const onRemoveImage = useCallback(
    (imageId: string): void => {
      dispatch(removeFromPool(imageId));
      // Prune the live bitmap cache alongside the pool entry (it's keyed by
      // imageId and never otherwise pruned — a leak the moment removal exists)
      // and release the decoded ImageBitmap's GPU/CPU memory.
      setBitmaps((prev) => {
        const bm = prev.get(imageId);
        if (bm === undefined) return prev;
        bm.close();
        const next = new Map(prev);
        next.delete(imageId);
        return next;
      });
    },
    [dispatch],
  );

  const onDrop = useCallback(
    (ev: DropEvent): void => {
      // Drops can arrive via GridCells per-panel handlers OR via the
      // annotation layer's passthrough (zIndex: 3 sits above the grid).
      // Either way, clear preview state so the ghost layer disappears.
      setHoverPanelId(null);
      setDragSource(null);
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
  // Stable across renders (useCallback in the hook); depend on this — not the
  // freshly-allocated `fieldCommit` object — in the target-change effect below.
  const flushFieldCommit = fieldCommit.flush;
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

  // 1.3: PropertiesPanel shares one debounced `fieldCommit` across every
  // property form. Editing target A then target B inside the 400 ms window
  // would reset the shared timer and collapse two logically separate edits
  // into one undo step. Flush the pending commit whenever the edit target
  // changes so each target's edits seal into their own step. We flush
  // (rather than key the hook to the id) because unmount cleanup only clears
  // the timer — it never fires the pending commit, silently dropping the
  // first edit. `flush()` is a safe no-op when nothing is pending.
  useEffect(() => {
    flushFieldCommit();
  }, [singleSelectedAnnoId, focusedPanelId, flushFieldCommit]);

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

  // Click-to-place: arm/toggle an unplaced tray image. Clicking the armed
  // image again disarms it.
  const onSelectThumb = useCallback((imageId: string) => {
    setSelectedThumbId((prev) => (prev === imageId ? null : imageId));
  }, []);

  // Place `imageId` into the first empty (image-less, visible) panel. Used by
  // Enter-on-thumbnail; no-op when the figure is full.
  const onPlaceIntoFirstEmpty = useCallback(
    (imageId: string) => {
      const target = stateRef.current.panels.find(
        (p) => p.imageId === undefined && p.hidden !== true,
      );
      if (target === undefined) return;
      dispatch(placeIntoPanel(imageId, target.id));
      setSelectedThumbId(null);
    },
    [dispatch],
  );

  const onPanelSingleClick = useCallback(
    (panelId: string) => {
      const panel = stateRef.current.panels.find((p) => p.id === panelId);
      // Click-to-place: if an unplaced image is armed and this panel is empty,
      // place it here (same action as a drop) and disarm.
      if (
        selectedThumbId !== null &&
        panel !== undefined &&
        panel.imageId === undefined &&
        panel.hidden !== true
      ) {
        dispatch(placeIntoPanel(selectedThumbId, panelId));
        setSelectedThumbId(null);
        setPanelInteraction({ mode: "selected", panelId });
        return;
      }
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
    [panelInteraction, selectedThumbId, dispatch],
  );

  const onPanelDoubleClick = useCallback((panelId: string) => {
    const panel = stateRef.current.panels.find((p) => p.id === panelId);
    if (panel === undefined || panel.imageId === undefined) return;
    // Stretch fit has no framing degrees of freedom (the image always
    // fills the panel) — select instead of entering Frame mode.
    if (panel.transform?.fit === "stretch") {
      setPanelInteraction({ mode: "selected", panelId });
      return;
    }
    setPanelInteraction({ mode: "editing", panelId });
  }, []);

  // Enter on a selected placed panel enters Frame mode (same gate as
  // double-click).
  const onEnterFrame = useCallback(() => {
    const sid = selectedIdOf(panelInteraction);
    if (sid === null) return;
    const panel = stateRef.current.panels.find((p) => p.id === sid);
    if (panel === undefined || panel.imageId === undefined) return;
    if (panel.transform?.fit === "stretch") return;
    setPanelInteraction({ mode: "editing", panelId: sid });
  }, [panelInteraction]);

  const onHoleClick = useCallback(
    (row: number, col: number) => {
      dispatch(restorePanelAt(row, col));
      // Drop merge selection — clicking a hole shouldn't leave behind
      // ghost shift-click marks on neighboring cells.
      selection.clear();
    },
    [dispatch, selection],
  );

  // Esc unwinds ONE level per press. Modals, the inline text editor, the
  // scale-bar popover, and Frame mode all consume Esc before it reaches
  // this global handler; what remains is armed tool → selections → nothing
  // (resolveEscape is the written-down order).
  const onEscape = useCallback(() => {
    const intent = resolveEscape({
      // Frame-mode Esc is consumed by useFrameGestures, so frameMode is
      // effectively false here unless the frame hook yielded (armed tool).
      frameMode: false,
      toolArmed: activeTool !== "select",
      hasSelection:
        panelInteraction !== null ||
        selectedAnnotationIds.size > 0 ||
        selection.selected.size > 0 ||
        selectedThumbId !== null,
    });
    if (intent === "disarm-tool") {
      setActiveTool("select");
      return;
    }
    if (intent === "clear-selections") {
      selection.clear();
      setPanelInteraction(null);
      setSelectedAnnotationIds(emptySelection());
      setSelectedThumbId(null);
    }
  }, [
    activeTool,
    panelInteraction,
    selectedAnnotationIds,
    selection,
    selectedThumbId,
  ]);

  // Returns true when the keystroke was consumed — annotations keep
  // priority over panel unplacing in useKeyboardShortcuts' Delete branch.
  const onDeleteAnnotation = useCallback((): boolean => {
    if (annotationEditing) return true; // an inline editor owns the keystroke
    if (selectedAnnotationIds.size === 0) return false;
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
    return true;
  }, [selectedAnnotationIds, annotationEditing, dispatch]);

  // Delete/Backspace with a placed panel focused (and no annotation
  // selected): return the image to the tray. The panel stays selected —
  // now empty — so the user can immediately drop a replacement.
  const onUnplacePanel = useCallback(() => {
    if (focusedPanelId === null) return;
    const panel = stateRef.current.panels.find((p) => p.id === focusedPanelId);
    if (panel === undefined || panel.imageId === undefined) return;
    dispatch(unplacePanel(focusedPanelId));
    history.commit();
    setPanelInteraction({ mode: "selected", panelId: focusedPanelId });
  }, [focusedPanelId, dispatch, history]);

  useKeyboardShortcuts({
    onMerge,
    onUnmerge,
    onEscape,
    onRotate90,
    onFlipH,
    onFlipV,
    onResetTransform,
    onDeleteAnnotation,
    onUnplacePanel,
    onEnterFrame,
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

  // One export hook shared by the toolbar menu AND the native menu-bar Export
  // items, so both call the same code and both report via toasts.
  const figureExport = useFigureExport({
    figure,
    images: bitmaps,
    pool: imagesByIdMemo,
    poolList: state.pool,
    rows: state.rows,
    cols: state.cols,
    gutterPx: state.gutterPx,
    jpegQuality,
    pushToast: toasts.push,
  });

  // Compute the focused panel's rect once for the interaction layer.
  const focusedPanelRect = useMemo(() => {
    if (selectedImagePanel === undefined) return null;
    return panelRectsByIdMemo.get(selectedImagePanel.id) ?? null;
  }, [panelRectsByIdMemo, selectedImagePanel]);

  const focusedBitmap =
    selectedImagePanel?.imageId !== undefined
      ? bitmaps.get(selectedImagePanel.imageId)
      : undefined;

  // Frame mode: the one true mode. Gestures retarget onto this target's
  // image, position-independently within the canvas pane.
  const frameTarget = useMemo((): FrameTarget | null => {
    if (editingIdOf(panelInteraction) === null) return null;
    if (selectedImagePanel?.transform === undefined) return null;
    if (selectedImagePanel.transform.fit === "stretch") return null;
    if (focusedPanelRect === null || focusedBitmap === undefined) return null;
    return {
      panelId: selectedImagePanel.id,
      panelRect: focusedPanelRect,
      transform: selectedImagePanel.transform,
      imageW: focusedBitmap.width,
      imageH: focusedBitmap.height,
    };
  }, [panelInteraction, selectedImagePanel, focusedPanelRect, focusedBitmap]);

  const onExitFrame = useCallback(() => {
    // Esc unwinds one level: framing ends, the panel stays selected.
    setPanelInteraction((pi) =>
      pi !== null && pi.mode === "editing"
        ? { mode: "selected", panelId: pi.panelId }
        : pi,
    );
  }, []);

  const frame = useFrameGestures({
    scrollRef: scrollRef as React.RefObject<HTMLElement>,
    wrapperRef: wrapperRef as React.RefObject<HTMLElement>,
    target: frameTarget,
    spaceHeld,
    toolArmed: activeTool !== "select",
    figurePxW: FIGURE_PX_W,
    figurePxH: FIGURE_PX_H,
    cssW: zoom.cssW,
    cssH: zoom.cssH,
    dispatch,
    onCommit: history.commit,
    onExit: onExitFrame,
  });

  // The single owner of canvas-pane wheel + background-pan gestures.
  const viewport = useViewportGestures({
    scrollRef: scrollRef as React.RefObject<HTMLElement>,
    spaceHeld,
    frameMode: frameTarget !== null,
    onZoomWheel: zoom.wheelZoom,
    onFrameWheelPan: frame.wheelPan,
    onFrameWheelZoom: frame.wheelZoom,
  });

  // Hint bar context — a pure projection of the interaction state.
  const hintContext: HintContext = {
    spaceHeld,
    frameMode: frameTarget !== null,
    toolArmed: activeTool !== "select",
    selection:
      focusedPanel === undefined
        ? "none"
        : focusedPanel.imageId !== undefined
          ? "placed-panel"
          : "empty-panel",
  };

  const onCalibrate = useCallback(() => {
    if (selectedImagePanel?.imageId === undefined) return;
    setCalibratingImageId(selectedImagePanel.imageId);
  }, [selectedImagePanel]);

  // Scale tool clicked an uncalibrated panel: open the calibration modal for
  // its image and remember the panel so we can place the bar on success.
  const onRequestCalibration = useCallback(
    (imageId: string, panelId: string) => {
      setPendingScalebarPanelId(panelId);
      setCalibratingImageId(imageId);
    },
    [],
  );

  // Calibration succeeded — if it was triggered by the scale tool, place the
  // scale bar the user originally asked for into the stashed panel.
  const onScalebarCalibrated = useCallback(() => {
    if (pendingScalebarPanelId === null) return;
    const panelId = pendingScalebarPanelId;
    setPendingScalebarPanelId(null);
    const panel = stateRef.current.panels.find((p) => p.id === panelId);
    if (panel === undefined || panel.imageId === undefined) return;
    const bar: ScaleBarAnnotation = {
      id: crypto.randomUUID(),
      kind: "scalebar",
      z: Z_SCALEBAR,
      panelId,
      imageId: panel.imageId,
      lengthValue: defaultScalebarStyle.lengthValue,
      lengthUnit: defaultScalebarStyle.lengthUnit,
      ...(defaultScalebarStyle.cornerOverride !== undefined
        ? { cornerOverride: defaultScalebarStyle.cornerOverride }
        : {}),
    };
    dispatch(addAnnotation(bar));
    history.commit();
  }, [pendingScalebarPanelId, defaultScalebarStyle, dispatch, history]);

  const onCrop = useCallback(() => {
    if (selectedImagePanel?.imageId === undefined) return;
    setCroppingPanelId(selectedImagePanel.id);
  }, [selectedImagePanel]);

  const onSaveProject = useCallback(async (): Promise<boolean> => {
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
      return false;
    }
    setProjectPath(r.filePath);
    markCleanNow();
    toasts.push({ kind: "success", message: "Project saved" });
    return true;
  }, [state, projectPath, toasts, markCleanNow]);

  // Gate a destructive action (New / Open) behind a native confirm when the
  // document is dirty. Returns true if the caller should proceed.
  const confirmDiscardIfDirty = useCallback(async (): Promise<boolean> => {
    if (!isDirty(stateRef.current, savedStateRef.current)) return true;
    const choice = await window.api.confirmDiscard();
    if (choice === "cancel") return false;
    if (choice === "save") return onSaveProject();
    return true; // discard
  }, [onSaveProject]);

  const onOpenProject = useCallback(async () => {
    if (!(await confirmDiscardIfDirty())) return;
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
    zoom.setView({ zoom: 1, mode: "fit" });
    setProjectPath(r.filePath);
    setMissingImages(r.missing);
    // The loaded project is the new clean baseline (RESET_TO_STATE lands next
    // render, so defer the clean-mark).
    markCleanNextRef.current = true;
    if (outcome.decodeFailures.length > 0) {
      toasts.push({
        kind: "error",
        message: `Some images failed to decode: ${outcome.decodeFailures
          .map((f) => f.imageId)
          .join(", ")}`,
      });
    }
    toasts.push({
      kind: "success",
      message: `Loaded ${basename(r.filePath)}`,
    });
  }, [dispatch, toasts, confirmDiscardIfDirty, zoom]);

  const onNew = useCallback(async () => {
    if (!(await confirmDiscardIfDirty())) return;
    dispatch(resetFigureAction());
    setBitmaps(new Map());
    setProjectPath(null);
    setPanelInteraction(null);
    setSelectedAnnotationIds(emptySelection());
    zoom.setView({ zoom: 1, mode: "fit" });
    // The reset figure is clean (lands next render, so defer the clean-mark).
    markCleanNextRef.current = true;
    toasts.push({ kind: "info", message: "New figure" });
  }, [dispatch, toasts, confirmDiscardIfDirty, zoom]);

  const onSaveAs = useCallback(async () => {
    setProjectPath(null);
    await onSaveProject();
  }, [onSaveProject]);

  useMenuEvents({
    onNew,
    onOpen: onOpenProject,
    onSave: onSaveProject,
    onSaveAs,
    onExportPng: () => void figureExport.runPng(),
    onExportJpeg: () => void figureExport.runJpeg(),
    onExportTiff: () => void figureExport.runTiff(),
    onExportPdf: () => void figureExport.runPdf(),
    onUndo: history.undo,
    onRedo: history.redo,
    // ⌘+/⌘−/⌘0/⌘1 live ONLY on the View menu (single-bound; the menu
    // accelerator consumes the keystroke and arrives here as an event).
    onZoomIn: zoom.zoomIn,
    onZoomOut: zoom.zoomOut,
    onZoomFit: zoom.fit,
    onZoomActual: zoom.actualSize,
  });

  // Window-close save flow: main shows the unsaved-changes dialog and, on
  // "Save", pushes this event. Save, then ask main to close the now-clean
  // window. If the save is canceled or fails, we simply don't call
  // requestClose — the window stays open.
  useEffect(() => {
    return window.api.onAppEvent((ev) => {
      if (ev === "app:before-close") {
        void onSaveProject().then((saved) => {
          if (saved) window.api.requestClose();
        });
      }
    });
  }, [onSaveProject]);

  const calibratingBitmap =
    calibratingImageId !== null ? bitmaps.get(calibratingImageId) : undefined;

  return (
    <InteractionProvider spaceHeld={spaceHeld}>
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
                void onNew();
              }}
              data-testid="new-project"
              title="New figure (⌘N)"
            >
              New
            </button>
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
            <span className="toolbar-divider" aria-hidden="true" />
            <button
              type="button"
              className="btn btn-icon"
              onClick={history.undo}
              disabled={!history.canUndo}
              data-testid="undo-btn"
              title="Undo (⌘Z)"
              aria-label="Undo"
            >
              ↶ Undo
            </button>
            <button
              type="button"
              className="btn btn-icon"
              onClick={history.redo}
              disabled={!history.canRedo}
              data-testid="redo-btn"
              title="Redo (⇧⌘Z)"
              aria-label="Redo"
            >
              ↷ Redo
            </button>
            <span
              className="app-doc-name"
              data-testid="doc-name"
              title={projectPath ?? "Unsaved figure"}
            >
              {projectPath !== null ? basename(projectPath) : "untitled.mosaic"}
              {dirty && (
                <span
                  className="app-doc-dirty"
                  data-testid="doc-dirty"
                  aria-label="Unsaved changes"
                  title="Unsaved changes"
                >
                  {" "}
                  •
                </span>
              )}
            </span>
          </div>
          <div className="app-bar-right">
            <ThemeToggle choice={themeChoice} onChoice={setThemeChoice} />
            <ExportMenu
              figure={figure}
              exportScale={figureExport.exportScale}
              status={figureExport.status}
              jpegQuality={jpegQuality}
              onJpegQualityChange={setJpegQuality}
              runPng={figureExport.runPng}
              runJpeg={figureExport.runJpeg}
              runTiff={figureExport.runTiff}
              runPdf={figureExport.runPdf}
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
            <label
              className="checkbox-row"
              title="Show or hide auto-generated per-panel letter labels (A, B, C…)"
              style={{ whiteSpace: "nowrap" }}
            >
              <input
                type="checkbox"
                checked={state.globalStyle.letters.enabled}
                onChange={() =>
                  dispatch(
                    setLettersEnabled(!state.globalStyle.letters.enabled),
                  )
                }
                data-testid="anno-letters-toggle"
              />
              Panel letters
            </label>
          </ToolGroup>
          <span className="toolbar-divider" aria-hidden="true" />
          <ToolGroup label="Merge">
            <MergeControls
              canMerge={canMerge}
              canUnmerge={canUnmerge}
              selectedCount={selection.selected.size}
              onMerge={onMerge}
              onUnmerge={onUnmerge}
            />
          </ToolGroup>
          <span className="toolbar-divider" aria-hidden="true" />
          <ToolGroup label="Annotate">
            <AnnotationToolbar active={activeTool} onChange={setActiveTool} />
          </ToolGroup>
          <span className="toolbar-divider" aria-hidden="true" />
          <ToolGroup label="Zoom">
            <ZoomControls
              displayPct={zoom.displayPct}
              isFit={zoom.isFit}
              onFit={zoom.fit}
              onActualSize={zoom.actualSize}
              onZoomIn={zoom.zoomIn}
              onZoomOut={zoom.zoomOut}
              onSetPercent={zoom.setPercent}
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
            onDragSourceChange={setDragSource}
            onRemoveImage={onRemoveImage}
            selectedThumbId={selectedThumbId}
            onSelectThumb={onSelectThumb}
            onPlaceIntoFirstEmpty={onPlaceIntoFirstEmpty}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minWidth: 0,
              minHeight: 0,
            }}
          >
            <section
              ref={scrollRef as React.RefObject<HTMLElement>}
              className={[
                "canvas-pane",
                spaceHeld ? "space-held" : "",
                viewport.panning ? "is-panning" : "",
                frameTarget !== null ? "frame-mode" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setPanelInteraction(null);
                  setSelectedThumbId(null);
                }
              }}
              style={{
                flex: 1,
                display: "flex",
                padding: 24,
                overflow: "auto",
                background: "var(--c-surface-sunken)",
              }}
            >
              <div
                ref={wrapperRef}
                style={{
                  position: "relative",
                  width: zoom.cssW,
                  height: zoom.cssH,
                  // Center the canvas with AUTO MARGINS, not flex justify/align.
                  // Two reasons: (1) flex would shrink this item's width to fit the
                  // pane when the zoomed canvas is wider than it — deforming the
                  // aspect ratio (height is explicit, width isn't). flexShrink:0
                  // stops that. (2) `justify-content:center` pushes an overflowing
                  // item's left/top edge OUTSIDE the scroll container where
                  // overflow:auto can't scroll to it; auto margins center when the
                  // content fits yet stay fully scroll-reachable when it overflows.
                  flexShrink: 0,
                  margin: "auto",
                  boxShadow: "var(--sh-md)",
                  // Frame the canvas with an OUTLINE (not border) so it doesn't
                  // consume layout space: the wrapper stays exactly cssW × cssH,
                  // keeping the canvas and the GridCells / annotation overlays
                  // (sized off the same cssW/cssH) pixel-aligned. A border here
                  // would shrink the content box and drift the overlay by 1px.
                  outline: "1px solid var(--c-border)",
                  outlineOffset: "-1px",
                }}
              >
                <EditorCanvas
                  figure={figure}
                  images={bitmaps}
                  pool={imagesByIdMemo}
                  editorScale={sourceScale}
                  theme={effectiveTheme}
                />
                <GridCells
                  state={state}
                  figurePxW={FIGURE_PX_W}
                  figurePxH={FIGURE_PX_H}
                  cssW={zoom.cssW}
                  cssH={zoom.cssH}
                  onDrop={onDrop}
                  hoverPanelId={hoverPanelId}
                  onHoverPanelChange={setHoverPanelId}
                  dragSource={dragSource}
                  onDragSourceChange={setDragSource}
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
                {frameTarget !== null && (
                  <FrameChrome
                    panelRect={frameTarget.panelRect}
                    figurePxW={FIGURE_PX_W}
                    figurePxH={FIGURE_PX_H}
                    cssW={zoom.cssW}
                    cssH={zoom.cssH}
                    zoomPct={frameTarget.transform.zoom * 100}
                  />
                )}
                {(() => {
                  // Corner resize handles belong to SELECTION (layout ops),
                  // not Frame mode (content framing).
                  const sid = selectedIdOf(panelInteraction);
                  if (sid === null) return null;
                  const panel = state.panels.find((p) => p.id === sid);
                  if (panel === undefined || panel.hidden === true) return null;
                  const rect = panelRectsByIdMemo.get(sid);
                  if (rect === undefined) return null;
                  return (
                    <SelectedPanelHandles
                      panelRect={rect}
                      figurePxW={FIGURE_PX_W}
                      figurePxH={FIGURE_PX_H}
                      cssW={zoom.cssW}
                      cssH={zoom.cssH}
                      onCommit={history.commit}
                      onResizeFreeform={(corner, dx, dy) => {
                        dispatch(
                          resizePanelFreeformAction(sid, corner, dx, dy, {
                            widthPx: FIGURE_PX_W,
                            heightPx: FIGURE_PX_H,
                          }),
                        );
                        // history.commit() runs on pointer-up via onCommit.
                      }}
                    />
                  );
                })()}
                <AnnotationInteractionLayer
                  activeTool={activeTool}
                  defaultSymbolStyle={defaultSymbolStyle}
                  defaultTextStyle={defaultTextStyle}
                  defaultScalebarStyle={defaultScalebarStyle}
                  onDefaultScalebarStyleChange={setDefaultScalebarStyle}
                  figure={figure}
                  panelRectsById={panelRectsByIdMemo}
                  imagesById={imagesByIdMemo}
                  cssW={zoom.cssW}
                  cssH={zoom.cssH}
                  figurePxW={FIGURE_PX_W}
                  figurePxH={FIGURE_PX_H}
                  selectedAnnotationIds={selectedAnnotationIds}
                  onSelectionChange={setSelectedAnnotationIds}
                  onEditingChange={setAnnotationEditing}
                  dispatch={dispatch}
                  onTrayDrop={onDrop}
                  onTrayDragHoverChange={setHoverPanelId}
                  onPanelDoubleClick={onPanelDoubleClick}
                  onPanelClick={onPanelSingleClick}
                  onHoleClick={onHoleClick}
                  onToolAutoReturn={() => setActiveTool("select")}
                  onRequestCalibration={onRequestCalibration}
                />
              </div>
            </section>
            <HintBar context={hintContext} />
          </div>
          <PropertiesPanel
            state={state}
            // Pass the raw focused panel, NOT selectedImagePanel: an empty
            // (image-less) panel must reach PropertiesPanel so its Hide/Delete
            // form renders. PropertiesPanel does its own image-vs-empty routing.
            focusedPanel={focusedPanel}
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
            defaultTextStyle={defaultTextStyle}
            onDefaultTextStyleChange={setDefaultTextStyle}
            defaultScalebarStyle={defaultScalebarStyle}
            onDefaultScalebarStyleChange={setDefaultScalebarStyle}
            dispatch={dispatch}
            commit={fieldCommit}
            onCalibrate={onCalibrate}
            onCrop={onCrop}
            onAddImages={() => {
              void onAddImagesClick();
            }}
          />
        </div>
        {calibratingImageId !== null && calibratingBitmap !== undefined && (
          <CalibrationModal
            bitmap={calibratingBitmap}
            imageId={calibratingImageId}
            onClose={() => {
              setCalibratingImageId(null);
              // Cancelled (or after success) — drop any pending scale-bar
              // placement so a later unrelated calibration won't place a bar.
              setPendingScalebarPanelId(null);
            }}
            onCalibrated={onScalebarCalibrated}
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
            onClose={() => setMissingImages([])}
            onRelinked={(resolutions, stillMissing) => {
              setBitmaps((prev) => {
                const next = new Map(prev);
                for (const r of resolutions) next.set(r.imageId, r.bitmap);
                return next;
              });
              // Persist the new path/dims/mime into FigureState so the next save
              // records the relinked location instead of the stale broken path.
              for (const r of resolutions) {
                dispatch(relinkPoolImage(r.imageId, r.patch));
              }
              setMissingImages(stillMissing);
            }}
          />
        )}
        <ToastTray toasts={toasts.toasts} onDismiss={toasts.dismiss} />
      </main>
    </InteractionProvider>
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
