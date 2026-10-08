// Only same-origin static scripts/weights are loaded. Image pixels stay here.
importScripts('./vendor/tf.min.js', './vendor/upscaler.min.js');
let upscaler, graphModel, onnxSession, modelKey, running = false;
async function loadModel(family, scale) {
  const key = `${family}/x${scale}`;
  if (modelKey === key && (upscaler || graphModel || onnxSession)) return;
  if (upscaler) { await upscaler.dispose(); upscaler = null; modelKey = null; }
  if (graphModel) { graphModel.dispose(); graphModel = null; modelKey = null; }
  if (onnxSession) { await onnxSession.release(); onnxSession = null; modelKey = null; }
  if (family === 'swinir') {
    if (!self.ort) importScripts('./vendor/onnx/ort.min.js');
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = new URL('./vendor/onnx/', self.location.href).href;
    onnxSession = await ort.InferenceSession.create(
      new URL('./vendor/models/swinir/x8/model.onnx', self.location.href).href,
      { executionProviders: ['wasm'] });
    modelKey = key;
    return;
  }
  // WebGL can use OffscreenCanvas in workers; CPU is the local fallback.
  try { if (typeof OffscreenCanvas === 'undefined' || !await tf.setBackend('webgl')) await tf.setBackend('cpu'); }
  catch (_) { await tf.setBackend('cpu'); }
  await tf.ready();
  if (family.startsWith('real-')) {
    graphModel = await tf.loadGraphModel(new URL(`./vendor/models/${family}/model.json`, self.location.href).href);
    modelKey = key;
    return;
  }
  importScripts(`./vendor/models/${key}/definition.js`);
  const name = `ESRGAN${family[0].toUpperCase() + family.slice(1)}${scale}x`;
  if (!self[name] || self[name].scale !== scale) throw Error('Lokalna definicija AI modela nije učitana.');
  const definition = { ...self[name], path: new URL(`./vendor/models/${key}/model.json`, self.location.href).href };
  // Removing CDN metadata prevents even a fallback request to an external host.
  delete definition._internals;
  const instance = new Upscaler({ model: definition });
  try { await instance.ready; }
  catch (error) { await instance.dispose().catch(() => {}); throw error; }
  upscaler = instance; modelKey = key;
}
async function upscaleReal(pixels, width, height, id) {
  // The converted Real-ESRGAN graphs have a fixed 64×64 RGB input.
  // Overlap tiles and split the overlap at its midpoint to avoid seams.
  const tile = 64, stride = 48, scale = 4;
  const origins = length => {
    if (length <= tile) return [0];
    const values = [];
    for (let n = 0; n < length - tile; n += stride) values.push(n);
    values.push(length - tile);
    return values;
  };
  const xs = origins(width), ys = origins(height);
  const rgba = new Uint8ClampedArray(width * height * scale * scale * 4);
  let completed = 0;
  for (let yi = 0; yi < ys.length; yi++) for (let xi = 0; xi < xs.length; xi++) {
    const x = xs[xi], y = ys[yi], rgb = new Float32Array(tile * tile * 3);
    for (let ty = 0; ty < tile; ty++) for (let tx = 0; tx < tile; tx++) {
      const src = (Math.min(height - 1, y + ty) * width + Math.min(width - 1, x + tx)) * 4;
      const dst = (ty * tile + tx) * 3;
      rgb[dst] = pixels[src] / 255; rgb[dst + 1] = pixels[src + 1] / 255; rgb[dst + 2] = pixels[src + 2] / 255;
    }
    const input = tf.tensor4d(rgb, [1, tile, tile, 3]);
    let prediction;
    try {
      prediction = graphModel.predict(input);
      if (Array.isArray(prediction)) prediction = prediction[0];
      if (prediction.shape.join(',') !== '1,256,256,3') throw Error('Neočekivana veličina Real-ESRGAN rezultata.');
      const values = await prediction.data();
      const left = xi ? Math.floor((xs[xi - 1] + tile + x) / 2) : 0;
      const right = xi + 1 < xs.length ? Math.floor((x + tile + xs[xi + 1]) / 2) : width;
      const top = yi ? Math.floor((ys[yi - 1] + tile + y) / 2) : 0;
      const bottom = yi + 1 < ys.length ? Math.floor((y + tile + ys[yi + 1]) / 2) : height;
      for (let oy = top * scale; oy < bottom * scale; oy++) for (let ox = left * scale; ox < right * scale; ox++) {
        const source = (((oy - y * scale) * tile * scale) + ox - x * scale) * 3;
        const target = (oy * width * scale + ox) * 4;
        rgba[target] = values[source] * 255; rgba[target + 1] = values[source + 1] * 255;
        rgba[target + 2] = values[source + 2] * 255; rgba[target + 3] = 255;
      }
    } finally { input.dispose(); prediction?.dispose(); }
    completed++;
    self.postMessage({ id, type: 'progress', stage: 'processing', value: completed / (xs.length * ys.length) });
  }
  return rgba;
}
async function upscaleSwinIR(pixels, width, height, id) {
  // Exported from the official 8× weights with a fixed 32×32 RGB input.
  const tile = 32, stride = 24, scale = 8, plane = tile * tile;
  const origins = length => {
    if (length <= tile) return [0];
    const values = [];
    for (let n = 0; n < length - tile; n += stride) values.push(n);
    values.push(length - tile);
    return values;
  };
  const xs = origins(width), ys = origins(height);
  const rgba = new Uint8ClampedArray(width * height * scale * scale * 4);
  let completed = 0;
  for (let yi = 0; yi < ys.length; yi++) for (let xi = 0; xi < xs.length; xi++) {
    const x = xs[xi], y = ys[yi], rgb = new Float32Array(plane * 3);
    for (let ty = 0; ty < tile; ty++) for (let tx = 0; tx < tile; tx++) {
      const src = (Math.min(height - 1, y + ty) * width + Math.min(width - 1, x + tx)) * 4;
      const dst = ty * tile + tx;
      rgb[dst] = pixels[src] / 255; rgb[plane + dst] = pixels[src + 1] / 255; rgb[plane * 2 + dst] = pixels[src + 2] / 255;
    }
    const input = new ort.Tensor('float32', rgb, [1, 3, tile, tile]);
    let output;
    try {
      output = (await onnxSession.run({ input })).output;
      if (output.dims.join(',') !== '1,3,256,256') throw Error('Neočekivana veličina SwinIR rezultata.');
      const values = output.data, outPlane = tile * scale * tile * scale;
      const left = xi ? Math.floor((xs[xi - 1] + tile + x) / 2) : 0;
      const right = xi + 1 < xs.length ? Math.floor((x + tile + xs[xi + 1]) / 2) : width;
      const top = yi ? Math.floor((ys[yi - 1] + tile + y) / 2) : 0;
      const bottom = yi + 1 < ys.length ? Math.floor((y + tile + ys[yi + 1]) / 2) : height;
      for (let oy = top * scale; oy < bottom * scale; oy++) for (let ox = left * scale; ox < right * scale; ox++) {
        const source = (oy - y * scale) * tile * scale + ox - x * scale;
        const target = (oy * width * scale + ox) * 4;
        rgba[target] = values[source] * 255; rgba[target + 1] = values[outPlane + source] * 255;
        rgba[target + 2] = values[outPlane * 2 + source] * 255; rgba[target + 3] = 255;
      }
    } finally { input.dispose?.(); output?.dispose?.(); }
    completed++;
    self.postMessage({ id, type: 'progress', stage: 'processing', value: completed / (xs.length * ys.length) });
  }
  return rgba;
}
self.onmessage = async ({ data }) => {
  const { id, width, height, pixels, family, scale, patchSize } = data;
  if (running) return;
  running = true;
  let input, output;
  try {
    if (!['slim', 'medium', 'thick', 'real-general', 'real-anime', 'swinir'].includes(family) || ![2, 4, 8].includes(scale) ||
        (scale === 8 && !['thick', 'swinir'].includes(family)) || (family.startsWith('real-') && scale !== 4) ||
        (family === 'swinir' && scale !== 8) ||
        !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width * height * scale * scale > 16777216 || width * scale > 8192 || height * scale > 8192 ||
        !(pixels instanceof ArrayBuffer) || pixels.byteLength !== width * height * 4) {
      throw Error('Neispravne dimenzije AI obrade.');
    }
    self.postMessage({ id, type: 'progress', stage: 'loading', value: 0 });
    await loadModel(family, scale);
    if (family === 'swinir') {
      const rgba = await upscaleSwinIR(new Uint8Array(pixels), width, height, id);
      self.postMessage({ id, type: 'result', width: width * 8, height: height * 8, pixels: rgba.buffer, backend: 'wasm' }, [rgba.buffer]);
      return;
    }
    if (family.startsWith('real-')) {
      const rgba = await upscaleReal(new Uint8Array(pixels), width, height, id);
      self.postMessage({ id, type: 'result', width: width * 4, height: height * 4, pixels: rgba.buffer, backend: tf.getBackend() }, [rgba.buffer]);
      return;
    }
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
