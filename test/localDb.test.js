import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createLocalDb } from '../api/tools/localDb.js';

function tempDbPath() {
  return path.join(mkdtempSync(path.join(os.tmpdir(), 'gaokao-db-')), 'app.db');
}

test('saves contact messages with review status', () => {
  const db = createLocalDb(tempDbPath());

  const saved = db.saveMessage({
    name: '张同学',
    email: 'student@example.com',
    message: '想咨询湖南物理类志愿。',
    ip: '127.0.0.1',
    userAgent: 'node-test'
  });

  assert.equal(saved.status, 'new');
  assert.equal(saved.name, '张同学');
  assert.equal(saved.email, 'student@example.com');
  assert.ok(saved.id > 0);

  const messages = db.listMessages();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].message, '想咨询湖南物理类志愿。');
});

test('reserves, completes, and blocks reused invite codes', () => {
  const db = createLocalDb(tempDbPath());
  db.createInviteCode({ code: 'FIRST88', note: 'first batch', maxUses: 1 });

  const reservation = db.reserveInviteCode(' first88 ', { ip: '127.0.0.1' });
  assert.equal(reservation.code, 'FIRST88');
  assert.ok(reservation.reservationId > 0);

  db.completeInviteReservation(reservation.reservationId);

  assert.throws(
    () => db.reserveInviteCode('FIRST88'),
    /邀请码已用完/
  );
});

test('releases failed invite reservations so the code can be used again', () => {
  const db = createLocalDb(tempDbPath());
  db.createInviteCode({ code: 'RETRY88', maxUses: 1 });

  const first = db.reserveInviteCode('RETRY88');
  db.releaseInviteReservation(first.reservationId);

  const second = db.reserveInviteCode('RETRY88');
  assert.ok(second.reservationId > first.reservationId);
});

test('rejects expired invite codes', () => {
  const db = createLocalDb(tempDbPath());
  db.createInviteCode({
    code: 'OLD88',
    maxUses: 1,
    expiresAt: '2020-01-01T00:00:00.000Z'
  });

  assert.throws(
    () => db.reserveInviteCode('OLD88'),
    /邀请码已过期/
  );
});

test('creates and advances advisor sessions with persisted stage data', () => {
  const db = createLocalDb(tempDbPath());

  const session = db.createAdvisorSession({
    province: '湖南',
    score: 580
  });

  assert.match(session.id, /^adv_[a-f0-9]{24}$/);
  assert.equal(session.currentStage, 'basic_info');
  assert.equal(session.data.province, '湖南');
  assert.equal(session.data.score, 580);

  const updated = db.updateAdvisorSession(session.id, {
    currentStage: 'interest_profile',
    data: { majorInterests: ['计算机类'] }
  });

  assert.equal(updated.currentStage, 'interest_profile');
  assert.deepEqual(updated.data, {
    province: '湖南',
    score: 580,
    majorInterests: ['计算机类']
  });

  const reloaded = db.getAdvisorSession(session.id);
  assert.deepEqual(reloaded, updated);
});

test('rejects invalid advisor session stage transitions', () => {
  const db = createLocalDb(tempDbPath());
  const session = db.createAdvisorSession();

  assert.throws(
    () => db.updateAdvisorSession(session.id, { currentStage: 'random_stage' }),
    /未知的志愿流程阶段/
  );
});
