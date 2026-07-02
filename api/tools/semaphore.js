// api/tools/semaphore.js
// 进程内并发闸门：限制同时执行的任务数，超出的排队等待。
// 用于 /api/generate —— 生成报告吃搜索渠道、LLM 配额和 CPU，
// 不设上限时高并发会让所有人的报告一起变慢、搜索被限流。

/**
 * @param {Object} opts
 * @param {number} opts.max       同时执行上限
 * @param {number} opts.queueMax  排队队列长度上限，超出直接拒绝
 * @param {number} opts.waitMs    排队最长等待时间，超时拒绝
 */
export function createSemaphore({ max, queueMax, waitMs }) {
  let running = 0;
  const queue = [];

  function rejectWith(reject, message) {
    const err = new Error(message);
    err.status = 503;
    reject(err);
  }

  function tryNext() {
    while (running < max && queue.length > 0) {
      const entry = queue.shift();
      clearTimeout(entry.timer);
      running++;
      entry.resolve();
    }
  }

  function acquire() {
    return new Promise((resolve, reject) => {
      if (running < max) {
        running++;
        resolve();
        return;
      }
      if (queue.length >= queueMax) {
        rejectWith(reject, `当前生成人数较多（正在生成 ${running} 份、排队 ${queue.length} 人），请 1-2 分钟后再试。本次不消耗邀请码。`);
        return;
      }
      const entry = {
        resolve,
        timer: setTimeout(() => {
          const i = queue.indexOf(entry);
          if (i >= 0) queue.splice(i, 1);
          rejectWith(reject, `排队等待超时（当前正在生成 ${running} 份），请稍后再试。本次不消耗邀请码。`);
        }, waitMs)
      };
      queue.push(entry);
    });
  }

  function release() {
    running = Math.max(0, running - 1);
    tryNext();
  }

  function stats() {
    return { running, queued: queue.length, max };
  }

  return { acquire, release, stats };
}
