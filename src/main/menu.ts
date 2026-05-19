import {
  Menu,
  type BrowserWindow,
  type MenuItemConstructorOptions,
} from "electron";
import { MENU_EVENTS, type MenuEvent } from "../preload/api";

export interface BuildMenuArgs {
  isMac: boolean;
  /** Sends a menu event to the renderer. Injected for testability. */
  send: (event: MenuEvent) => void;
}

export function buildMenuTemplate({
  isMac,
  send,
}: BuildMenuArgs): MenuItemConstructorOptions[] {
  const file: MenuItemConstructorOptions = {
    label: "File",
    submenu: [
      {
        label: "New",
        accelerator: "CommandOrControl+N",
        click: () => send(MENU_EVENTS.new),
      },
      {
        label: "Open…",
        accelerator: "CommandOrControl+O",
        click: () => send(MENU_EVENTS.open),
      },
      { type: "separator" },
      {
        label: "Save",
        accelerator: "CommandOrControl+S",
        click: () => send(MENU_EVENTS.save),
      },
      {
        label: "Save As…",
        accelerator: "CommandOrControl+Shift+S",
        click: () => send(MENU_EVENTS.saveAs),
      },
      { type: "separator" },
      { label: "Export as PNG…", click: () => send(MENU_EVENTS.exportPng) },
      { label: "Export as JPEG…", click: () => send(MENU_EVENTS.exportJpeg) },
      { label: "Export as TIFF…", click: () => send(MENU_EVENTS.exportTiff) },
      { label: "Export as PDF…", click: () => send(MENU_EVENTS.exportPdf) },
      { type: "separator" },
      isMac ? { role: "close" as const } : { role: "quit" as const },
    ],
  };
  const edit: MenuItemConstructorOptions = {
    label: "Edit",
    submenu: [
      {
        label: "Undo",
        accelerator: "CommandOrControl+Z",
        click: () => send(MENU_EVENTS.undo),
      },
      {
        label: "Redo",
        accelerator: "CommandOrControl+Shift+Z",
        click: () => send(MENU_EVENTS.redo),
      },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  };
  const view: MenuItemConstructorOptions = {
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  };
  const help: MenuItemConstructorOptions = {
    label: "Help",
    submenu: [{ label: "About Mosaic Builder", role: "about" }],
  };
  if (isMac) {
    const appMenu: MenuItemConstructorOptions = {
      label: "Mosaic Builder",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    };
    return [appMenu, file, edit, view, help];
  }
  return [file, edit, view, help];
}

export function installMenu(window: BrowserWindow): void {
  const isMac = process.platform === "darwin";
  const send = (event: MenuEvent): void => {
    window.webContents.send("menu:event", event);
  };
  const tpl = buildMenuTemplate({ isMac, send });
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}
