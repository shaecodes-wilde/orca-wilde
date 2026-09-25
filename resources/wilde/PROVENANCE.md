# Wilde Systems mark — provenance

## Source

`wilde-mark-64.png` and `wilde-mark-128.png` are derived from the Wilde Systems
"Fluid" WS monogram (brand guide v2.6), supplied by the fork owner as
`wilde-systems-logo.original.png` (1041868 bytes).

- Original SHA-256: `75fe93a4f7d21609456ebc394c3215e44f241dc120a496ad67f86927bc26f8b0`
- Derivatives are **downsample-only**: aspect ratio and alpha channel preserved;
  no redraw, stretch, colour-shift, or glow. 64x59 and 128x117 RGBA PNGs.
- The original and intermediate 256/512 exports are intentionally **not** shipped
  in this repo or the packaged app; only the compact runtime derivatives are.

## Permission basis

Wilde Systems brand assets are used in this fork with the fork owner's approval.
**No trademark endorsement is implied** — the WS mark identifies the fork's
theme, not a Wilde Systems product, affiliation, or endorsement of Orca.

## Brand-guide exception

The brand guide's 32px digital minimum applies to the full monogram. Rendering
`wilde-mark-64`/`wilde-mark-128` at 24px in compact contexts (badges, dense
chrome) is a **documented exception** approved for this fork — it is not a claim
of compliance with the standard minimum.

## Upstream assets unchanged

The upstream MIT LICENSE (Lovecast Inc.) remains at the repo root and covers
upstream code only. `resources/logo.svg` (the Orca mark) is untouched; both
marks ship side by side.

## App icon

`app-icon-source.png` is the Orca Wilde desktop icon supplied by Wilde Systems on
2026-09-25 (1254×1252, transparent corners), kept unmodified. The shipped icons are
derived from it: the visible tile is cropped, centred on a square canvas and scaled
to 87% of the canvas to match the stock Orca icon's padding.

| File | Size |
|---|---|
| `resources/build/icon.ico` | 16, 24, 32, 48, 64, 128, 256 |
| `resources/build/icon.png` | 1024 |
| `resources/build/icon.icns` | 16–1024 |
| `resources/icon.png`, `resources/icon-dev.png` | 256 (window/taskbar, "Classic" app icon) |

These replace the stock Orca "Classic" icon files in place, so upstream merges only
conflict if upstream changes those same binaries (keep ours).
