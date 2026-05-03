import { createHash } from "node:crypto";

/** Returns the lowercase hex sha256 of the given bytes. */
export function sha256OfBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
