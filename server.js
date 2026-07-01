import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateInviteCode, getLocalDb } from './api/tools/localDb.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态前端
app.use(express.static(path.join(__dirname, 'web')));

function clientMeta(req) {
  return {
    ip: req.ip || req.socket?.remoteAddress || '',
    userAgent: req.get('user-agent') || ''
  };
}

function requireAdmin(req, res, next) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    return res.status(503).json({ error: 'ADMIN_TOKEN 未配置，管理员接口不可用' });
  }
  const provided = req.get('x-admin-token') || req.query.token;
  if (provided !== adminToken) {
    return res.status(401).json({ error: '管理员口令不正确' });
  }
  next();
}

app.post('/api/messages', (req, res) => {
  try {
    const saved = getLocalDb().saveMessage({ ...req.body, ...clientMeta(req) });
    res.json({ ok: true, message: saved });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '留言保存失败' });
  }
});

app.get('/api/admin/messages', requireAdmin, (req, res) => {
  try {
    res.json({ ok: true, messages: getLocalDb().listMessages({ limit: req.query.limit }) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '留言读取失败' });
  }
});

app.get('/api/admin/invite-codes', requireAdmin, (req, res) => {
  try {
    res.json({ ok: true, inviteCodes: getLocalDb().listInviteCodes({ limit: req.query.limit }) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '邀请码读取失败' });
  }
});

app.post('/api/admin/invite-codes', requireAdmin, (req, res) => {
  try {
    const input = { ...req.body };
    let lastErr = null;
    for (let i = 0; i < 5; i++) {
      try {
        const invite = getLocalDb().createInviteCode({
          code: input.code || generateInviteCode(),
          note: input.note,
          maxUses: input.maxUses,
          expiresAt: input.expiresAt
        });
        return res.json({ ok: true, inviteCode: invite });
      } catch (err) {
        lastErr = err;
        if (input.code || err.message !== '邀请码已存在') throw err;
      }
    }
    throw lastErr || new Error('邀请码生成失败');
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '邀请码生成失败' });
  }
});

// API 路由（带超时保护）
app.post('/api/generate', async (req, res) => {
  let reservation = null;
  let timedOut = false;
  // 250 秒服务端超时（前端 230 秒 + 20 秒余量，均大于 Agent 195 秒内部预算）
  const reqTimeout = setTimeout(() => {
    timedOut = true;
    if (reservation) {
      getLocalDb().releaseInviteReservation(reservation.reservationId);
    }
    if (!res.headersSent) {
      res.status(504).json({ error: '服务端超时（250秒），请稍后重试。' });
    }
  }, 250000);

  const { generatePlan } = await import('./api/generate.js');
  try {
    reservation = getLocalDb().reserveInviteCode(req.body.inviteCode, clientMeta(req));
    const result = await generatePlan(req.body);
    clearTimeout(reqTimeout);
    if (reservation && !timedOut) {
      getLocalDb().completeInviteReservation(reservation.reservationId);
    }
    if (!res.headersSent) {
      res.json({ ...result, invite: { code: reservation.code, used: true } });
    }
  } catch (err) {
    clearTimeout(reqTimeout);
    if (reservation) {
      getLocalDb().releaseInviteReservation(reservation.reservationId);
    }
    console.error('[generate] error:', err);
    if (!res.headersSent) {
      res.status(err.status || 500).json({
        error: err.message || '生成失败',
        detail: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });
    }
  }
});

// 专门下载 docx 文件（前端拿到 base64 后通过此端点转 blob 也可，这里提供直链备用）
app.post('/api/download-docx', express.json({ limit: '10mb' }), (req, res) => {
  try {
    const { docxBase64, filename } = req.body;
    if (!docxBase64) return res.status(400).json({ error: '缺少 docxBase64' });
    const buf = Buffer.from(docxBase64, 'base64');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename || '高考志愿方案.docx')}"`);
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[gaokao-advisor] running at http://0.0.0.0:${PORT}`);
  console.log(`[gaokao-advisor] search provider: ${process.env.SEARCH_PROVIDER || 'bing'}`);
  console.log(`[gaokao-advisor] deepseek model: ${process.env.DEEPSEEK_MODEL || 'deepseek-chat'}`);
});
