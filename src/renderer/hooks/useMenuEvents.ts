import { useEffect, useRef } from "react";

export interface MenuEventHandlers {
  /** May be async — fire-and-forget; errors should be surfaced via toasts. */
  onNew: () => void | Promise<void>;
  /** May be async — fire-and-forget; errors should be surfaced via toasts. */
  onOpen: () => void | Promise<void>;
  /**
   * May be async and resolve to a saved-success boolean — fire-and-forget
   * here; the return is used elsewhere (close-then-save flow). Errors should
   * be surfaced via toasts.
   */
  onSave: () => void | Promise<unknown>;
  /** May be async — fire-and-forget; errors should be surfaced via toasts. */
  onSaveAs: () => void | Promise<void>;
  onExportPng: () => void;
  onExportJpeg: () => void;
  onExportTiff: () => void;
  onExportPdf: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onZoomActual: () => void;
}

export function useMenuEvents(handlers: MenuEventHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const unsubscribe = window.api.onMenuEvent((ev) => {
      const h = ref.current;
      switch (ev) {
        case "menu:new":
          void h.onNew();
          break;
        case "menu:open":
          void h.onOpen();
          break;
        case "menu:save":
          void h.onSave();
          break;
        case "menu:save-as":
          void h.onSaveAs();
          break;
        case "menu:export-png":
          h.onExportPng();
          break;
        case "menu:export-jpeg":
          h.onExportJpeg();
          break;
        case "menu:export-tiff":
          h.onExportTiff();
          break;
        case "menu:export-pdf":
          h.onExportPdf();
          break;
        case "menu:undo":
          h.onUndo();
          break;
        case "menu:redo":
          h.onRedo();
          break;
        case "menu:zoom-in":
          h.onZoomIn();
          break;
        case "menu:zoom-out":
          h.onZoomOut();
          break;
        case "menu:zoom-fit":
          h.onZoomFit();
          break;
        case "menu:zoom-actual":
          h.onZoomActual();
          break;
      }
    });
    return unsubscribe;
  }, []);
}
