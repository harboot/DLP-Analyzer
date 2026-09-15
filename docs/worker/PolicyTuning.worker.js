'use strict';

importScripts('../js/policy-tuning.js');

const cancelledJobs = new Set();

self.onmessage = async ({ data }) => {
  if (data.type === 'cancel') {
    cancelledJobs.add(data.jobId);
    return;
  }
  if (data.type !== 'analyze') return;

  const { jobId, rows } = data;
  try {
    const report = await self.PolicyTuning.analyzeAsync(rows, {
      isCancelled: () => cancelledJobs.has(jobId),
      onProgress: progress => self.postMessage({ type: 'progress', jobId, ...progress })
    });
    if (!cancelledJobs.has(jobId)) self.postMessage({ type: 'complete', jobId, report });
  } catch (error) {
    const cancelled = cancelledJobs.has(jobId) || error.message === 'Analysis cancelled.';
    self.postMessage({ type: cancelled ? 'cancelled' : 'error', jobId, message: error.message || String(error) });
  } finally {
    cancelledJobs.delete(jobId);
  }
};
