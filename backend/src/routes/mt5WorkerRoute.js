const express=require('express');
const controller=require('../controller/mt5OptimizationController');
const router=express.Router();
const binary=express.raw({type:'application/octet-stream',limit:'250mb'});

router.get('/api/mt5-queue/health',controller.queueHealth);
router.post('/api/v1/apikeys/verify',controller.verifyApiKey);
router.post('/jobs/claim',controller.claimJob);
router.post('/jobs/statuses',controller.getStatuses);
router.post('/jobs/heartbeat',controller.jobHeartbeat);
router.post('/jobs/done',controller.jobDone);
router.post('/jobs/fail',controller.jobFail);
router.post('/workers/heartbeat',controller.workerHeartbeat);
router.get('/workers/:worker',controller.getWorker);
router.get('/artifacts/jobs/:id/download',controller.downloadInput);
router.post('/jobs/:id/artifacts/upload',binary,controller.uploadArtifact);
router.post('/jobs/:id/artifacts/upload-chunk',binary,controller.uploadArtifactChunk);
router.get('/jobs/:id/artifacts/result/status',controller.artifactStatus);
router.get('/jobs/:id/artifacts/result/download',controller.downloadResult);
router.post('/jobs/:id/optimize-results/session/start',controller.startOptimizeUpload);
router.post('/jobs/:id/optimize-results/session/chunk',controller.saveOptimizeChunk);
router.post('/jobs/:id/optimize-results/session/finalize',controller.finalizeOptimizeUpload);
router.post('/jobs/:id/optimize-results',controller.saveLegacyOptimizeChunk);
router.post('/jobs/:id/backtest-results',controller.saveBacktestResult);

module.exports=router;
