// Runtime files are committed so GitHub Pages needs no build or external CDN.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function copy(source, target) {
  const destination = path.join(root, 'vendor', target);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, 'node_modules', source), destination);
}
copy('@tensorflow/tfjs/dist/tf.min.js', 'tf.min.js');
fs.mkdirSync(path.join(root, 'vendor/licenses'), { recursive: true });
fs.copyFileSync(path.join(__dirname, 'tensorflow-LICENSE.txt'), path.join(root, 'vendor/licenses/tensorflow.txt'));
copy('upscaler/dist/browser/umd/upscaler.min.js', 'upscaler.min.js');
copy('upscaler/LICENSE', 'licenses/upscaler.txt');
for (const file of ['ort.min.js', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) {
  copy(`onnxruntime-web/dist/${file}`, `onnx/${file}`);
}
for (const family of ['slim', 'medium', 'thick']) {
  const pkg = `@upscalerjs/esrgan-${family}`;
  copy(`${pkg}/LICENSE`, `licenses/esrgan-${family}.txt`);
  for (const scale of (family === 'thick' ? [2, 4, 8] : [2, 4])) {
    copy(`${pkg}/dist/umd/models/esrgan-${family}/src/x${scale}/index.min.js`, `models/${family}/x${scale}/definition.js`);
    const model = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', pkg, `models/x${scale}/model.json`)));
    copy(`${pkg}/models/x${scale}/model.json`, `models/${family}/x${scale}/model.json`);
    for (const shard of model.weightsManifest.flatMap(group => group.paths)) {
      copy(`${pkg}/models/x${scale}/${shard}`, `models/${family}/x${scale}/${shard}`);
    }
  }
}
console.log('Vendored pinned TensorFlow.js, UpscalerJS, ONNX Runtime Web and ESRGAN 2×/4×/8× models.');
