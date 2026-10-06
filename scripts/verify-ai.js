// Run the actual shipped worker with real model weights on the CPU backend.
// Browser GPU speed/quality still needs checking on the target device.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
async function main() {
  const requests = [], messages = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url);
    const relative = request.url.slice('/scene-splitter/'.length);
    if (!request.url.startsWith('/scene-splitter/vendor/') || relative.includes('..')) { response.writeHead(404); response.end(); return; }
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
    response.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/scene-splitter/`;
  // Block external fetches so a hidden CDN fallback fails the test.
  const realFetch = global.fetch;
  global.fetch = (...args) => {
    const url = String(args[0]);
    assert(url.startsWith(base), `Unexpected external fetch: ${url}`);
    return realFetch(...args);
  };
  let context;
  context = vm.createContext({ location: { href: base + 'ai-worker.js' }, postMessage: message => messages.push(message), URL, ArrayBuffer, Uint8Array, Uint8ClampedArray, AbortController,
    setTimeout, clearTimeout, console, performance, TextEncoder, TextDecoder, WorkerGlobalScope: function () {},
    navigator: { userAgent: 'Worker CPU verification' }, fetch: async (...args) => {
      const response = await global.fetch(...args);
      // Response.json() must create arrays in the worker realm, as in a browser.
      response.json = async () => {
        context.modelJSON = await response.text();
        return vm.runInContext('JSON.parse(modelJSON)', context);
      };
      return response;
    },
    importScripts: (...urls) => {
      for (const url of urls) {
        vm.runInContext(fs.readFileSync(path.join(root, url), 'utf8'), context, { filename: url });
      }
    } });
  context.self = context;
  const self = context;
  const workerCode = fs.readFileSync(path.join(root, 'ai-worker.js'), 'utf8');
  vm.runInContext(workerCode.replace('message: error.message', 'message: error.stack || error.message'), context);
  const tf = context.tf;
  let id = 0;
  async function infer(family, scale) {
    const width = 20, height = 17, pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      pixels[i] = x * 12; pixels[i + 1] = y * 15; pixels[i + 2] = (x + y) % 2 ? 220 : 30; pixels[i + 3] = 255;
    }
    const requestId = ++id, start = Date.now();
    await self.onmessage({ data: { id: requestId, width, height, pixels: pixels.buffer, family, scale, patchSize: 16 } });
    const error = messages.find(message => message.id === requestId && message.type === 'error');
    assert(!error, error?.message);
    const result = messages.find(message => message.id === requestId && message.type === 'result');
    assert(result, 'Worker did not return an image');
    assert.deepStrictEqual([result.width, result.height], [width * scale, height * scale]);
    const rgba = new Uint8ClampedArray(result.pixels);
    assert.strictEqual(rgba.length, width * height * scale * scale * 4);
    assert(rgba.every((value, index) => index % 4 !== 3 || value === 255));
    assert(new Set(rgba).size > 32, 'Model returned a flat image');
    assert(messages.some(message => message.id === requestId && message.stage === 'processing' && message.value > 0));
    assert.strictEqual(result.backend, 'cpu');
    console.log(`${family} ${scale}×: real local inference, multiple padded patches, ${result.width} × ${result.height}, ${Date.now() - start} ms: OK`);
  }
  try {
    for (const family of ['slim', 'medium']) for (const scale of [2, 4]) await infer(family, scale);
    const tensorCount = tf.memory().numTensors, requestCount = requests.length;
    await infer('medium', 4);
    assert.strictEqual(requests.length, requestCount, 'A cached model was re-downloaded');
    assert.strictEqual(tf.memory().numTensors, tensorCount, 'Repeated inference leaked tensors');
    await self.onmessage({ data: { id: ++id, width: 100000, height: 100000, family: 'slim', scale: 4, pixels: new ArrayBuffer(0) } });
    assert(messages.some(message => message.id === id && message.type === 'error'));
    assert(requests.every(url => url.startsWith('/scene-splitter/vendor/models/')));
    console.log('All four vendored models, no external fetches, model reuse, tensor cleanup and oversized-input rejection: OK');
  } finally {
    await vm.runInContext('upscaler?.dispose()', context);
    global.fetch = realFetch;
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
