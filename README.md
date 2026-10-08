# Iseci i podeli

Crop one part of an image or split it into multiple independently adjustable parts. Static app for GitHub Pages with automatic and manual grid selection.

## GitHub Pages
Upload these files to the repository root, then:
Settings → Pages → Deploy from a branch → main → /(root) → Save.

All image processing happens locally in the browser.

Upload an image, adjust any of the independent scene rectangles, and choose Original or a square 2048, 3072, or 4096 px JPEG export. Preview and ZIP use each scene's current crop. Square export preserves the full crop without stretching by adding white margins when needed. Upscaling interpolates pixels and cannot recover missing source detail.

Double-click a scene in the main preview to select and focus it. While focus is active, a click on another scene focuses that scene. Double-click the focused scene again, or press “Ukloni fokus”, to restore the zoom and position from before focus. The preview includes padding around the source image so outer-edge handles remain visible. Toggle “Prikaži sve granice” to show the other scenes in white without resize handles. To align the selected scene, choose a reference scene and Top, Bottom, Left or Right; the matching coordinate is copied to the selected scene only. Alignments that would cross its opposite edge are rejected.

Run `node verify.js` for crop, focus, alignment, export and service-worker checks.

Enter original-pixel width and height and use “Primeni dimenzije” to resize the selected crop. Choose an aspect preset or a custom positive width:height and use “Primeni odnos” to lock it for that scene. The lock is maintained during dragging and dimension changes. Locked alignment translates the whole crop. Applying “Slobodno” unlocks the aspect ratio. Resizing keeps the top-left position when possible and shifts the crop inside the source image if necessary; invalid or oversized dimensions are rejected.

Every yellow handle has a scene number at 55% text opacity; the handle remains opaque. Alternating pale green/blue arrow handles placed inside each scene between the resize handles copy that edge from the adjacent grid scene: left/right arrows on horizontal edges and up/down arrows on vertical edges. Directions without a neighbour are omitted. Click an arrow to align; dragging, cancellation, and pinch gestures do not trigger alignment. On screens at least 1000 px wide the controls sit to the right of the canvas; narrower screens retain the controls above it.

The all-boundaries overview uses pale-yellow outlines, hides yellow resize handles, and disables resizing, manual dimensions and aspect changes. Arrow clicks align a scene while retaining overview; clicking a scene returns to single-scene editing. Panning, pinching and cancelled clicks keep overview open.


## Local AI export

AI enhancement uses UpscalerJS 1.0.0 with TensorFlow.js 4.11.0. All runtime scripts and slim/medium 2×/4× models are committed in `vendor/`. No image is uploaded and no third-party inference API or CDN is contacted. Static assets download from this site's own origin on first use; the service worker caches successful requests for offline reuse. An unused model still needs its first online download.

Select **AI poboljšanje** (off, 2× or 4×), **AI kvalitet** (automatic, faster/slim, or more detailed/medium), and PNG/JPEG. AI runs on original cropped pixels in a dedicated Web Worker, using WebGL/OffscreenCanvas when supported and a local CPU fallback otherwise. Automatic mode uses slim and smaller patches on mobile/low-memory devices. It processes the ZIP scenes sequentially. PNG is the default lossless output; JPEG uses quality 0.98. Both single-scene downloads and ZIP follow the same settings.

With **Original** output size, AI preserves the crop's aspect and exports its 2×/4× dimensions. Square output sizes fit the enhanced crop without stretching and add white margins as before. Choosing a square larger than the AI result involves further ordinary interpolation. AI estimates details and may alter textures; it cannot guarantee print quality. Use **Uporedi AI rezultat** for a before/after comparison of the selected crop before printing. The comparison fits the screen without enlarging beyond the generated image dimensions. Existing grid thumbnails continue to preview original crop boundaries.

AI comparison and exports show a full-screen progress overlay that blocks the controls until completion or cancellation. **Prekini** terminates the worker and suppresses the download; an interrupted ZIP is never downloaded partially. Retry starts a fresh worker. Output is limited to about 8 million AI pixels on mobile/low-memory devices and 16 million on desktop, with an 8192 px side limit. If processing fails, retry with 2×/slim or choose AI off. CPU performance and mobile GPU support vary; no target-device benchmark has been performed.

The committed vendor files let GitHub Pages serve this repository without a build. To reproduce them: `npm ci`, then `npm run vendor:ai`. Dependencies and versions are pinned in `package-lock.json`. Third-party licenses are in `vendor/licenses/`; TensorFlow.js is Apache-2.0 and UpscalerJS/model packages are MIT.

Run `npm test` for geometry/export checks, worker cancellation/device-profile checks, service-worker offline caching, and real inference of all four vendored models using the shipped browser bundles on a CPU backend. The inference test starts a temporary loopback server and rejects external fetches. It validates shapes, multi-patch processing, model reuse and tensor cleanup, rather than claiming visual improvements from synthetic test data.

## Grid detection

Automatic mode estimates rows and columns independently from bright or dark gutters spanning the image. It supports rectangular and unevenly spaced grids and excludes detected gutters from crops. Analysis uses a preview up to 1200 pixels; exports retain original image pixels. This is a gutter heuristic, not semantic scene recognition: merged cells, overlapping collages and images without clear separators may need manual selection. With no detected separators the image stays as one scene.

Choose Ručno, enter 1–12 columns and rows, then Primeni mrežu. Manual mode refines equal divisions to nearby detected gutters, otherwise uses equal cells. Reapplying detection or changing the grid resets crop adjustments and aspect locks. Navigation, neighbor alignment and ZIP export use the resulting scene count.

## Interface

The light interface follows `ui.png`: a large image canvas with the scene gallery below it, and a desktop sidebar with upload, grid, crop, zoom, AI and export cards. On smaller screens the canvas and controls stack vertically. The preview fits within the viewport height while exports retain their original dimensions. Drag and drop or choose an image up to 50 MB. Privacy and usage help are available from the header; extra alignment controls are under Poravnanje i pomoć.

Prikaži scenu opens the original crop in a floating preview. Uporedi AI rezultat opens a before/after slider with full-resolution original and locally enhanced images; use the slider, Original or AI rezultat, then download the scene. Escape or the close button dismisses the preview. The AI toggle remembers the previous 2×/4× scale. The gallery stays below the canvas; its heading folds or unfolds the scene cards.
