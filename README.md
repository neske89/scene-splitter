# Scene Splitter

Static 4×4 image splitter for GitHub Pages.

## GitHub Pages
Upload these files to the repository root, then:
Settings → Pages → Deploy from a branch → main → /(root) → Save.

All image processing happens locally in the browser.

Upload an image, adjust any of the 16 independent scene rectangles, and choose Original or a square 2048, 3072, or 4096 px JPEG export. Preview and ZIP use each scene's current crop. Square export preserves the full crop without stretching by adding white margins when needed. Upscaling interpolates pixels and cannot recover missing source detail.

Double-click a scene in the main preview to select and focus it. The preview includes padding around the source image so outer-edge handles remain visible. Toggle “Prikaži sve granice” to show the other scenes in white. To align the selected scene, choose a reference scene and Top, Bottom, Left or Right; the matching coordinate is copied to the selected scene only. Alignments that would cross its opposite edge are rejected.

Run `node verify.js` for crop, focus, alignment, export and service-worker checks.

Enter original-pixel width and height and use “Primeni dimenzije” to resize the selected crop. Choose an aspect preset or a custom positive width:height and use “Primeni odnos” to lock it for that scene. The lock is maintained during dragging and dimension changes. Locked alignment translates the whole crop. Applying “Slobodno” unlocks the aspect ratio. Resizing keeps the top-left position when possible and shifts the crop inside the source image if necessary; invalid or oversized dimensions are rejected.

Every yellow handle has a scene number at 55% text opacity; the handle remains opaque. Alternating pale green/blue arrow handles placed inside each scene between the resize handles copy that edge from the adjacent grid scene: left/right arrows on horizontal edges and up/down arrows on vertical edges. Directions without a neighbour are omitted. Click an arrow to align; dragging, cancellation, and pinch gestures do not trigger alignment. On screens at least 1000 px wide the controls sit to the right of the canvas; narrower screens retain the controls above it.

The all-boundaries overview uses pale-yellow outlines and disables resizing, manual dimensions and aspect changes. Arrow clicks align a scene while retaining overview; clicking a scene or its yellow handle returns to single-scene editing. Panning, pinching and cancelled clicks keep overview open.
