# Changelog

All notable changes to this project. Format loosely follows [Keep a Changelog](https://keepachangelog.com/); versions follow the plugin's own `package.json`.

## [0.7.0] — 2026-11-02

### Added
- **Eraser** (`E`). Drag to erase; the diameter follows the width slider (width × 4). It removes ink, not the image underneath.
- **Arc tool** (`C`). Drag an arc — the more your path bends, the more the arc bends. Degenerates into a straight line when the three points are collinear or the radius is absurd.
- **Line tool** (`L`) with `Shift` snapping to 45° multiples.
- **Shape menu.** Rectangle, square, triangle, ellipse, diamond, star and heart collapse into one toolbar cell with a pop-over; each still has its own key (`R S T O D G H`).
- **Zoom and pan.** Wheel zooms 1×–6× anchored at the pointer, hold `Space` and drag to pan, `0` resets. The official previewer scales with a transform and produces no scrollbar, so zooming alone only ever showed the top-left corner; during annotation the plugin takes over the image transform and restores it on exit.

### Fixed
- The eraser used to delete a whole stroke. It now erases by diameter — strokes are recorded as paths and punched out with `destination-out`.
- Undo is snapshot-based, so erasing and deleting are undoable. The previous index-based scheme could not see a deletion at all.
- An empty note no longer falls back to "请看这张图上标了编号的位置". When nothing is numbered, the image is sent with no text.
- Export composites ink on a separate layer before erasing, so the source image is never punched through.

### Changed
- Snap threshold 8 px → 10 px; endpoints were sometimes hard to catch.

## [0.6.2] — 2026-10-31

### Changed
- Shape tools (rectangle, square, triangle) draw **from the pressed corner** again. The centre-out variant introduced in 0.6.1 was reverted after real use: dragging from an edge is easier on a first try. The centre-out implementation is kept in the source tree as an alternate build.

## [0.6.1] — 2026-10-31

### Changed
- Shape tools drew **from the pointer position outward** as a centre anchor. Reverted in 0.6.2.

## [0.6.0] — 2026-10-31

### Added
- Continuous 1–12 px width slider alongside the three preset dots.
- Custom colour picker next to the four presets.
- Redo — button plus `Ctrl+Shift+Z` / `Ctrl+Y`; undo runs on a stack and any new action clears the redo chain.

### Changed
- Toolbar rebuilt as a single translucent frosted capsule (rounded ends, backdrop blur, 1 px ring, shadow) to match the reference design.
- Key hints moved out of the capsule onto an absolutely positioned line, so the capsule stays one row.

### Fixed
- Canvas pointer handling moved to native listeners. The layer is portalled outside the React root and synthetic pointer events never reached it.

## [0.5.0] — 2026-10-31

### Added
- Six tools with keyboard shortcuts: mark `V`, pen `P`, arrow `A`, rectangle `R`, square `S`, triangle `T`.
- Three width presets (2 / 4 / 7 px) with `[` / `]`.
- Undo ordered by the sequence of actions rather than by category.

### Fixed
- Width, arrow and box had been declared but were unreachable: no width button was rendered, and the stroke kind was hard-coded to `pen` at press time.
- Keyboard shortcuts were swallowed while the conversation composer held focus.

## [0.4.1] — 2026-10-29

### Fixed
- Interface language is read from the host locale service instead of `document.documentElement.lang`, which is hard-coded to `en` in the shell and turned a Chinese UI English.

## [0.4.0] — 2026-10-29

### Added
- Numbered marker plus note card as the primary mode, following the reference annotation flow.

### Changed
- Pen demoted to a secondary mode.

## [0.3.0] — 2026-10-29

### Added
- Arrow and box tools, four colours, three width presets, undo and clear.

## [0.2.0] — 2026-10-29

### Changed
- The annotation layer draws **in place** on the sidebar image. The earlier centred dialog with a copied image was removed.

## [0.1.0] — 2026-10-29

### Added
- First version: annotate button in the document preview header, pen annotation on a copied image inside a centred dialog, send the composite back to the conversation.
