// Load the committed ONNX file through the same WASM runtime used by the browser.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const ort = require('onnxruntime-web');
const file = path.join(__dirname, '../vendor/models/swinir/x8/model.onnx');
const bytes = fs.readFileSync(file);
assert.strictEqual(createHash('sha256').update(bytes).digest('hex'),
  'da764f0f10d70dd87de17d2a6f5f96ef720786ac9c307aa98f596655adaa4978');
ort.env.wasm.numThreads = 1;
(async () => {
  const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
  try {
    assert.deepStrictEqual(session.inputNames, ['input']);
    const input = new ort.Tensor('float32', new Float32Array(3 * 32 * 32).fill(.5), [1, 3, 32, 32]);
    const output = (await session.run({ input })).output;
    assert.deepStrictEqual(output.dims, [1, 3, 256, 256]);
    assert(output.data.every(Number.isFinite));
    assert(output.data.some(value => Math.abs(value - .5) > .001));
    output.dispose?.(); input.dispose?.();
    console.log('SwinIR 8× ONNX checksum and real WASM inference: OK');
  } finally { await session.release(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
