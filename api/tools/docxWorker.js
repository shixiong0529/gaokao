// api/tools/docxWorker.js
// Word（docx）转换 worker：html-to-docx 是 CPU 密集操作，单份报告约需 1 秒，
// 放在主线程会阻塞事件循环——并发时所有请求（含静态页面）一起卡顿。
import { parentPort, workerData } from 'node:worker_threads';

const HTMLtoDOCX = (await import('html-to-docx')).default;

try {
  const buffer = await HTMLtoDOCX(workerData.html, null, { table: { row: { cantSplit: true } } });
  parentPort.postMessage({ ok: true, base64: Buffer.from(buffer).toString('base64') });
} catch (err) {
  parentPort.postMessage({ ok: false, error: err.message || String(err) });
}
