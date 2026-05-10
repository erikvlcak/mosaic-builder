# QA feedback — May 2026

Each file in this directory is an independent spec describing one item from
the QA pass on 2026-05-08. They are independent — implement them in any
order, though a few have natural prerequisites (called out in each spec's
**Depends on** section).

## Index

| #   | Spec                                                                                | Scope  | Risk   |
| --- | ----------------------------------------------------------------------------------- | ------ | ------ |
| 01  | [Drag image from panel back to tray](01-drag-image-back-to-tray.md)                 | small  | low    |
| 02  | [Hide / delete empty panels](02-hide-and-delete-empty-panels.md)                    | medium | medium |
| 03  | [Fix JPEG export (dark image)](03-fix-jpeg-export.md)                               | small  | low    |
| 04  | [Fix PDF export (image too small)](04-fix-pdf-export.md)                            | small  | low    |
| 05  | [Annotations bind to image when created over one](05-annotations-bind-to-image.md)  | medium | medium |
| 06  | [Replace "arrow" with curated symbol library](06-symbol-library.md)                 | medium | low    |
| 07  | [Multi-select annotations + bulk edit](07-multi-select-annotations.md)              | medium | medium |
| 08  | [Per-letter text & style overrides + patterns](08-letter-overrides-and-patterns.md) | medium | low    |
| 09  | [Crop images (non-destructive panel transform)](09-crop-images.md)                  | medium | medium |
| 10  | [Outer-gutter toggle](10-outer-gutter-toggle.md)                                    | small  | low    |
| 11  | [Manual panel resize (uniform → free-form)](11-panel-resize.md)                     | large  | high   |
| 12  | [Fix Export dropdown clipping](12-fix-export-dropdown-clipping.md)                  | small  | low    |
| 13  | [Hold-spacebar Select + click-on-anno selects](13-select-mode-shortcuts.md)         | small  | low    |
| 14  | [Alignment guidelines while dragging](14-alignment-guidelines.md)                   | medium | low    |

## Recommended execution order

Quick wins first (12, 03, 04, 01, 10, 13), then the medium items, then 11
last (it's the only one that touches the grid model deeply and risks
regressing other features).

## Conventions

- All specs assume the existing reducer + figure-state architecture.
- New `FigureAction` variants are listed under "Reducer changes" in each
  spec; they should be added to the same exhaustiveness-checked switch.
- Tests follow the existing pattern: reducer-level tests in
  `src/renderer/model/*.test.ts`, component tests via Vitest where the
  current code already has them.
