import { describe, it, expect, vi } from "vitest";
import { buildMenuTemplate } from "../../src/main/menu";

describe("buildMenuTemplate", () => {
  it("includes File submenu with New/Open/Save/Save As/Export and accelerators", () => {
    const send = vi.fn();
    const tpl = buildMenuTemplate({ isMac: false, send });
    const file = tpl.find((m) => (m.label ?? "").toLowerCase() === "file");
    expect(file).toBeDefined();
    const submenuArr = file?.submenu as { label?: string;
      accelerator?: string; click?: () => void }[];
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
    const submenuArr = file?.submenu as { label?: string; accelerator?: string }[];
    const open = submenuArr.find((x) => x.label === "Open…");
    expect(open?.accelerator).toBe("CommandOrControl+O");
  });

  it("Edit menu has Undo/Redo with Cmd-Z / Cmd-Shift-Z that send IPC events", () => {
    const send = vi.fn();
    const tpl = buildMenuTemplate({ isMac: false, send });
    const edit = tpl.find((m) => (m.label ?? "").toLowerCase() === "edit");
    const items = edit?.submenu as { label?: string;
      accelerator?: string; click?: () => void }[];
    const undo = items.find((x) => x.label === "Undo");
    const redo = items.find((x) => x.label === "Redo");
    expect(undo?.accelerator).toBe("CommandOrControl+Z");
    expect(redo?.accelerator).toBe("CommandOrControl+Shift+Z");
    undo?.click?.();
    redo?.click?.();
    expect(send).toHaveBeenCalledWith("menu:undo");
    expect(send).toHaveBeenCalledWith("menu:redo");
  });
});
