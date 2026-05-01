/**
 * Pure factory that resolves a BrowserWindow config from inputs.
 * Kept side-effect-free so it can be unit-tested without Electron.
 */

export interface WindowFactoryInput {
  preloadPath: string;
  devServerUrl: string | undefined;
}

export type LoadTarget =
  | { kind: "url"; url: string }
  | { kind: "file" };

export interface ResolvedWindowConfig {
  width: number;
  height: number;
  show: boolean;
  backgroundColor: string;
  webPreferences: {
    preload: string;
    contextIsolation: true;
    nodeIntegration: false;
    sandbox: true;
    webSecurity: true;
  };
  loadTarget: LoadTarget;
}

export function resolveWindowConfig(
  input: WindowFactoryInput,
): ResolvedWindowConfig {
  return {
    width: 1440,
    height: 900,
    show: false,
    backgroundColor: "#FFFFFF",
    webPreferences: {
      preload: input.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
    loadTarget:
      input.devServerUrl !== undefined
        ? { kind: "url", url: input.devServerUrl }
        : { kind: "file" },
  };
}
