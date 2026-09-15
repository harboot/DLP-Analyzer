(function (global) {
  'use strict';
  function ingest(files, options = {}) {
    const worker = new Worker('worker/DataIngest.worker.js');
    let settled = false;
    let rejectTask;
    const promise = new Promise((resolve, reject) => {
      rejectTask = reject;
      worker.onmessage = event => {
        const message = event.data;
        options.onMessage?.(message);
        if (message.type === 'complete') { settled = true; worker.terminate(); resolve(message); }
        else if (message.type === 'error' || message.type === 'cancelled') { settled = true; worker.terminate(); reject(new Error(message.message || 'Ingestion cancelled.')); }
      };
      worker.onerror = event => { settled = true; worker.terminate(); reject(new Error(event.message || 'The ingestion worker failed.')); };
      worker.postMessage({ type: 'ingest', files: Array.from(files), normalizeAlerts: options.normalizeAlerts, batchSize: options.batchSize });
    });
    return { promise, cancel() { if (!settled) { settled = true; worker.postMessage({ type: 'cancel' }); worker.terminate(); rejectTask(new Error('Ingestion cancelled.')); } } };
  }
  async function collect(files, options) {
    const rows = []; let headers = [];
    const task = ingest(files, { ...options, onMessage(message) {
      if (message.type === 'headers' && message.fileIndex === 0) headers = message.headers;
      if (message.type === 'batch') rows.push(...message.rows);
      options?.onMessage?.(message);
    } });
    await task.promise;
    Object.defineProperty(rows, 'headers', { value: headers });
    return rows;
  }
  global.CSVUtils = Object.freeze({
    ingest,
    parseFile(file, options) { return collect([file], options); },
    parseText(text, options) { return collect([new File([String(text ?? '')], 'inline.csv', { type: 'text/csv' })], options); }
  });
})(window);
