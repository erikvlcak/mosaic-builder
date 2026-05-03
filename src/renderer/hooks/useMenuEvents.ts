import { useEffect, useRef } from "react";

export interface MenuEventHandlers {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExportPng: () => void;
  onExportJpeg: () => void;
  onExportTiff: () => void;
  onExportPdf: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function useMenuEvents(handlers: MenuEventHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const unsubscribe = window.api.onMenuEvent((ev) => {
      const h = ref.current;
      switch (ev) {
        case "menu:new":
          h.onNew();
          break;
        case "menu:open":
          h.onOpen();
          break;
        case "menu:save":
          h.onSave();
          break;
        case "menu:save-as":
          h.onSaveAs();
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
      }
    });
    return unsubscribe;
  }, []);
}
