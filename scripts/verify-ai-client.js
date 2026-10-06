const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const workers = [];
class Worker {
  constructor(url) { assert.strictEqual(url, './ai-worker.js'); workers.push(this); }
  postMessage(data) { this.message = data; }
  terminate() { this.terminated = true; }
  reply(data) { this.onmessage({ data: { id: this.message.id, ...data } }); }
}
const navigator = { userAgent: 'Desktop', deviceMemory: 8 };
const context = vm.createContext({ navigator, Worker });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../ai.js'), 'utf8'), context);
const ai = context.SceneAI;
const canvas = { width: 20, height: 10, getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(20 * 10 * 4) }) }) };
async function main() {
  assert.strictEqual(ai.settings('auto', 2).family, 'medium');
  navigator.userAgent = 'iPhone';
  const mobile = ai.settings('auto', 2);
  assert.strictEqual(mobile.family, 'slim');
  assert.strictEqual(mobile.patchSize, 24);
  const progress = [], promise = ai.upscale(canvas, mobile, event => progress.push(event.value));
  const first = workers[0];
  first.reply({ type: 'progress', value: .5 });
  await assert.rejects(ai.upscale(canvas, mobile), /već u toku/);
  first.reply({ type: 'result', width: 40, height: 20, pixels: new ArrayBuffer(3200) });
  assert.strictEqual((await promise).width, 40); assert.deepStrictEqual(progress, [.5]);
  assert.strictEqual(first.message.pixels.byteLength, 800);
  const cancelled = ai.upscale(canvas, mobile);
  ai.abort(); await assert.rejects(cancelled, error => error.name === 'AbortError');
  assert(first.terminated);
  const retry = ai.upscale(canvas, mobile), second = workers[1];
  // A late response or error from a terminated worker must not cancel its replacement.
  first.reply({ type: 'result', width: 0 }); first.onerror();
  assert(!second.terminated);
  second.reply({ type: 'result', width: 40, height: 20 }); assert.strictEqual((await retry).width, 40);
  const failed = ai.upscale(canvas, mobile);
  second.reply({ type: 'error', message: 'model missing' }); await assert.rejects(failed, /model missing/);
  await assert.rejects(ai.upscale({ width: 8192, height: 8192 }, mobile), /prevelik/);
  assert.strictEqual(workers.length, 2);
  console.log('AI client device profiles, progress, busy lock, termination/retry, stale events, failure and memory limits: OK');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
