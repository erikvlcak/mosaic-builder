/**
 * Single source of truth for the preload→main IPC contract.
 * Imported as a type by the renderer (no runtime code crosses the boundary).
 */

export const API_CHANNELS = {
  ping: "mosaic:ping",
} as const;

export type ApiChannel = (typeof API_CHANNELS)[keyof typeof API_CHANNELS];

export interface MosaicApi {
  ping(): Promise<number>;
}
