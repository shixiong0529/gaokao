import assert from 'node:assert/strict';
import test from 'node:test';
import { createSemaphore } from '../api/tools/semaphore.js';

test('semaphore limits concurrency and drains queue in order', async () => {
  const gate = createSemaphore({ max: 2, queueMax: 10, waitMs: 5000 });

  await gate.acquire();
  await gate.acquire();
  assert.deepEqual(gate.stats(), { running: 2, queued: 0, max: 2 });

  let thirdStarted = false;
  const third = gate.acquire().then(() => { thirdStarted = true; });
  await new Promise(r => setTimeout(r, 20));
  assert.equal(thirdStarted, false, '超出上限的请求应排队');
  assert.equal(gate.stats().queued, 1);

  gate.release();
  await third;
  assert.equal(thirdStarted, true, '释放槽位后队首应被放行');
  assert.deepEqual(gate.stats(), { running: 2, queued: 0, max: 2 });
});

test('semaphore rejects when queue is full', async () => {
  const gate = createSemaphore({ max: 1, queueMax: 1, waitMs: 5000 });

  await gate.acquire();
  const queued = gate.acquire(); // 占满队列
  await assert.rejects(gate.acquire(), (err) => {
    assert.equal(err.status, 503);
    assert.match(err.message, /生成人数较多/);
    return true;
  });

  gate.release();
  await queued;
  gate.release();
});

test('semaphore rejects queued request after wait timeout', async () => {
  const gate = createSemaphore({ max: 1, queueMax: 5, waitMs: 50 });

  await gate.acquire();
  await assert.rejects(gate.acquire(), (err) => {
    assert.equal(err.status, 503);
    assert.match(err.message, /排队等待超时/);
    return true;
  });
  assert.equal(gate.stats().queued, 0, '超时的请求应从队列移除');
  gate.release();
});

test('generate endpoint acquires slot before reserving invite code', async () => {
  const { readFileSync } = await import('node:fs');
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  const acquireIdx = server.indexOf('generateGate.acquire()');
  const reserveIdx = server.indexOf('reserveInviteCode');
  assert.ok(acquireIdx > -1, '缺少并发闸门');
  assert.ok(reserveIdx > acquireIdx, '必须先拿槽位再预占邀请码，排队失败不能动邀请码');
  assert.match(server, /generateGate\.release\(\)/);
});
