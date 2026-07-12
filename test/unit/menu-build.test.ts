import { describe, it, expect, vi } from "vitest";
import { buildMenuTemplate } from "../../src/main/menu";

describe("buildMenuTemplate", () => {
  it("includes File submenu with New/Open/Save/Save As/Export and accelerators", () => {
    const send = vi.fn();
    const tpl = buildMenuTemplate({ isMac: false, send });
    const file = tpl.find((m) => (m.label ?? "").toLowerCase() === "file");
    expect(file).toBeDefined();
    const submenuArr = file?.submenu as {
      label?: string;
      accelerator?: string;
      click?: () => void;
    }[];
    const labels = submenuArr.map((x) => x.label ?? "");
    expect(labels).toEqual(
      expect.arrayContaining(["New", "Open…", "Save", "Save As…"]),
    );
    const newItem = submenuArr.find((x) => x.label === "New");
    expect(newItem?.accelerator).toBe("CommandOrControl+N");
    newItem?.click?.();
    expect(send).toHaveBeenCalledWith("menu:new");
  });

  it("uses Cmd shortcuts on macOS and adds the app menu", () => {
    const tpl = buildMenuTemplate({ isMac: true, send: vi.fn() });
    expect((tpl[0]?.label ?? "").toLowerCase()).toBe("mosaic builder");
    const file = tpl.find((m) => (m.label ?? "").toLowerCase() === "file");
    const submenuArr = file?.submenu as {
      label?: string;
      accelerator?: string;
    }[];
    const open = submenuArr.find((x) => x.label === "Open…");
    expect(open?.accelerator).toBe("CommandOrControl+O");
  });

  it("Edit menu has Undo/Redo with Cmd-Z / Cmd-Shift-Z that send IPC events", () => {
    const send = vi.fn();
    const tpl = buildMenuTemplate({ isMac: false, send });
    const edit = tpl.find((m) => (m.label ?? "").toLowerCase() === "edit");
    const items = edit?.submenu as {
      label?: string;
      accelerator?: string;
      click?: () => void;
    }[];
    const undo = items.find((x) => x.label === "Undo");
    const redo = items.find((x) => x.label === "Redo");
    expect(undo?.accelerator).toBe("CommandOrControl+Z");
    expect(redo?.accelerator).toBe("CommandOrControl+Shift+Z");
    undo?.click?.();
    redo?.click?.();
    expect(send).toHaveBeenCalledWith("menu:undo");
    expect(send).toHaveBeenCalledWith("menu:redo");
  });

  it("View menu binds ⌘+/⌘−/⌘0/⌘1 to canvas zoom events, not webpage-zoom roles", () => {
    const send = vi.fn();
    const tpl = buildMenuTemplate({ isMac: true, send });
    const view = tpl.find((m) => (m.label ?? "").toLowerCase() === "view");
    const items = view?.submenu as {
      label?: string;
      role?: string;
      accelerator?: string;
      click?: () => void;
    }[];
    // The Electron roles would double-bind the same accelerators and zoom
    // the whole UI instead of the figure.
    const roles = items.map((x) => x.role).filter(Boolean);
    expect(roles).not.toContain("resetZoom");
    expect(roles).not.toContain("zoomIn");
    expect(roles).not.toContain("zoomOut");
    const zoomIn = items.find((x) => x.label === "Zoom In");
    const zoomOut = items.find((x) => x.label === "Zoom Out");
    const fit = items.find((x) => x.label === "Zoom to Fit");
    const actual = items.find((x) => x.label === "Actual Size");
    expect(zoomIn?.accelerator).toBe("CommandOrControl+=");
    expect(zoomOut?.accelerator).toBe("CommandOrControl+-");
    expect(fit?.accelerator).toBe("CommandOrControl+0");
    expect(actual?.accelerator).toBe("CommandOrControl+1");
    zoomIn?.click?.();
    zoomOut?.click?.();
    fit?.click?.();
    actual?.click?.();
    expect(send).toHaveBeenCalledWith("menu:zoom-in");
    expect(send).toHaveBeenCalledWith("menu:zoom-out");
    expect(send).toHaveBeenCalledWith("menu:zoom-fit");
    expect(send).toHaveBeenCalledWith("menu:zoom-actual");
  });
});
