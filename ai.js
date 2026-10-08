(function (scope) {
  let worker = null, active = null, requestId = 0;
  function smallDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') ||
      (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform || '')) ||
      (navigator.deviceMemory && navigator.deviceMemory <= 4);
  }
  function settings(profile, scale) {
    if (!['auto', 'slim', 'medium', 'thick', 'real-general', 'real-anime'].includes(profile) || ![2, 4, 8].includes(scale) ||
        (scale === 8 && profile !== 'thick') || (profile.startsWith('real-') && scale !== 4)) throw Error('Neispravan AI režim.');
    const small = smallDevice();
    return { family: profile === 'auto' ? (small ? 'slim' : 'medium') : profile,
      scale, patchSize: small ? 24 : 48, maxPixels: small ? 8388608 : 16777216 };
  }
  function terminate(error) {
    worker?.terminate(); worker = null;
    const pending = active; active = null;
    if (pending) pending.reject(error);
  }
  function abort() { terminate(Object.assign(Error('Obrada je prekinuta.'), { name: 'AbortError' })); }
  function upscale(canvas, options, progress) {
    if (active) return Promise.reject(Error('AI obrada je već u toku.'));
    const width = canvas.width, height = canvas.height;
    if (width * height * options.scale ** 2 > options.maxPixels || width * options.scale > 8192 || height * options.scale > 8192) {
      return Promise.reject(Error('AI rezultat je prevelik za ovaj uređaj. Izaberi manji okvir scene ili ciljnu veličinu.'));
    }
    if (typeof Worker === 'undefined') return Promise.reject(Error('Ovaj pregledač ne podržava lokalnu AI obradu. Izaberi izvoz bez AI.'));
    return new Promise((resolve, reject) => {
      try {
        if (!worker) {
          worker = new Worker('./ai-worker.js');
          const instance = worker;
          worker.onerror = () => { if (worker === instance) terminate(Error('Lokalni AI nije pokrenut. Proveri učitavanje modela ili izaberi izvoz bez AI.')); };
          worker.onmessage = ({ data }) => {
            if (!active || data.id !== active.id) return;
            if (data.type === 'progress') { active.progress?.(data); return; }
            if (data.type === 'error') { terminate(Error(data.message)); return; }
            if (data.type === 'result') {
              const pending = active; active = null;
              pending.resolve(data);
            }
          };
        }
        const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
        active = { id: ++requestId, resolve, reject, progress };
        worker.postMessage({ id: requestId, width, height, pixels: pixels.buffer,
          family: options.family, scale: options.scale, patchSize: options.patchSize }, [pixels.buffer]);
      } catch (error) { terminate(error); reject(error); }
    });
  }
  scope.SceneAI = { settings, upscale, abort };
})(globalThis);
