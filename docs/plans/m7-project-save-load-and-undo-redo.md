# M7 — Project save/load + undo/redo

## Shipped

- `.mosaic` JSON v1 schema with hand-rolled validator (`src/renderer/model/schema.ts`).
- Pure serializer/deserializer (`src/renderer/model/serialize.ts`) — posix `relPath`, sha256 hint, no fs.
- Main-process IO (`src/main/project-io.ts`) — save, load, sha256 mismatch flag, missing-image enumeration.
- Two new IPC channels: `mosaic:project-save`, `mosaic:project-load`.
- Toolbar Save / Open buttons.
- Relink modal (`src/renderer/components/Modals/RelinkModal.tsx`) for missing-on-load images.
- Undo/redo backed by a generic 10-deep ring buffer (`src/renderer/state/history.ts`)
  - `useHistoryReducer` (`src/renderer/state/use-history-reducer.ts`).
  * Pan/zoom drags = transient + explicit `commit()` on `pointerup` / wheel-end (250ms debounce).
  * `RESET_TO_STATE` (used by project-load) clears history.
- Cmd/Ctrl-Z undo, Cmd/Ctrl-Shift-Z redo, gated to ignore typing targets.
- Bitmaps NEVER persist — they live in `useState<Map<string, ImageBitmap>>` in
  `App.tsx` and are rebuilt on load by re-running `decodeImageBytes` over the
  bytes returned by main-process project-load.

## Test coverage

- `test/unit/history.test.ts` — pure ring-buffer mechanics + 10-cap.
- `test/unit/use-history-reducer.test.ts` — transient/commit/undo/redo over `figureReducer`.
- `test/unit/schema.test.ts` — validator accepts/rejects.
- `test/unit/serialize.test.ts` — relPath posix form, sha256 attach, fromMosaicFile relink hints.
- `test/unit/sha256.test.ts` — node:crypto wrapper.
- `test/unit/project-io.test.ts` — save round-trip, missing-image flag, sha256 mismatch flag, validation failure.
- `test/unit/m7-roundtrip.test.ts` — reducer × history × serialize × schema integration.

## Out of scope (deferred)

- Multi-snapshot save (overwriting `Save` without re-prompting): every Save
  in M7 is effectively Save-As. M8 will track the active project path and
  add a separate Save vs Save As.
- Schema migrations: there's only v1, so no migration table is needed yet.
- Recent-projects list.
