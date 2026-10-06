// Only same-origin static scripts/weights are loaded. Image pixels stay here.
importScripts('./vendor/tf.min.js', './vendor/upscaler.min.js');
let upscaler, modelKey, running = false;
async function loadModel(family, scale) {
  const key = `${family}/x${scale}`;
  if (modelKey === key && upscaler) return;
  if (upscaler) { await upscaler.dispose(); upscaler = null; modelKey = null; }
  // WebGL can use OffscreenCanvas in workers; CPU is the local fallback.
  try { if (typeof OffscreenCanvas === 'undefined' || !await tf.setBackend('webgl')) await tf.setBackend('cpu'); }
  catch (_) { await tf.setBackend('cpu'); }
  await tf.ready();
  importScripts(`./vendor/models/${key}/definition.js`);
  const name = `ESRGAN${family === 'slim' ? 'Slim' : 'Medium'}${scale}x`;
  if (!self[name] || self[name].scale !== scale) throw Error('Lokalna definicija AI modela nije učitana.');
  const definition = { ...self[name], path: new URL(`./vendor/models/${key}/model.json`, self.location.href).href };
  // Removing CDN metadata prevents even a fallback request to an external host.
  delete definition._internals;
  const instance = new Upscaler({ model: definition });
  try { await instance.ready; }
  catch (error) { await instance.dispose().catch(() => {}); throw error; }
  upscaler = instance; modelKey = key;
}
self.onmessage = async ({ data }) => {
  const { id, width, height, pixels, family, scale, patchSize } = data;
  if (running) return;
  running = true;
  let input, output;
  try {
    if (!['slim', 'medium'].includes(family) || ![2, 4].includes(scale) ||
        !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width * height * scale * scale > 16777216 || width * scale > 8192 || height * scale > 8192 ||
        !(pixels instanceof ArrayBuffer) || pixels.byteLength !== width * height * 4) {
      throw Error('Neispravne dimenzije AI obrade.');
    }
    self.postMessage({ id, type: 'progress', stage: 'loading', value: 0 });
    await loadModel(family, scale);
    input = tf.tidy(() => tf.tensor3d(new Uint8Array(pixels), [height, width, 4], 'int32').slice([0, 0, 0], [-1, -1, 3]));
    output = await upscaler.upscale(input, {
      output: 'tensor', patchSize: Math.max(16, Math.min(64, patchSize || 32)), padding: 4,
      awaitNextFrame: true,
      progress: value => self.postMessage({ id, type: 'progress', stage: 'processing', value }),
    });
    const [outHeight, outWidth, channels] = output.shape;
    if (channels !== 3 || outWidth !== width * scale || outHeight !== height * scale) throw Error(`Neočekivana veličina AI rezultata: ${output.shape.join(' × ')}.`);
    const rgb = await output.data(), rgba = new Uint8ClampedArray(outWidth * outHeight * 4);
    for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
      rgba[j] = rgb[i]; rgba[j + 1] = rgb[i + 1]; rgba[j + 2] = rgb[i + 2]; rgba[j + 3] = 255;
    }
    self.postMessage({ id, type: 'result', width: outWidth, height: outHeight, pixels: rgba.buffer, backend: tf.getBackend() }, [rgba.buffer]);
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error.message || 'AI obrada nije uspela.' });
  } finally {
    input?.dispose(); output?.dispose(); running = false;
  }
};
