# Scene Splitter

Static 4×4 image splitter for GitHub Pages.

## GitHub Pages
Upload these files to the repository root, then:
Settings → Pages → Deploy from a branch → main → /(root) → Save.

All image processing happens locally in the browser.

Upload an image, adjust any of the 16 independent scene rectangles, and choose Original or a square 2048, 3072, or 4096 px JPEG export. Preview and ZIP use each scene's current crop. Square export preserves the full crop without stretching by adding white margins when needed. Upscaling interpolates pixels and cannot recover missing source detail.
