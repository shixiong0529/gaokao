import express from 'express';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateInviteCode, getLocalDb } from './api/tools/localDb.js';
import { createSemaphore } from './api/tools/semaphore.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const ADMISSION_FILES = {
  anhui: 'anhui-2025-benke.json',
  beijing: 'beijing-2025-benke.json',
  chongqing: 'chongqing-2025-benke.json',
  fujian: 'fujian-2025-benke.json',
  guangdong: 'guangdong-2025-benke.json',
  guangxi: 'guangxi-2025-benke.json',
  guizhou: 'guizhou-2025-benke.json',
  hainan: 'hainan-2025-benke.json',
  hebei: 'hebei-2025-benke.json',
  heilongjiang: 'heilongjiang-2025-benke.json',
  hubei: 'hubei-2025-benke.json',
  hunan: 'hunan-2025-benke.json',
  jiangsu: 'jiangsu-2025-benke.json',
  jiangxi: 'jiangxi-2025-benke.json',
  liaoning: 'liaoning-2025-benke.json',
  neimenggu: 'neimenggu-2025-benke.json',
  shandong: 'shandong-2025-benke.json',
  shanghai: 'shanghai-2025-benke.json',
  shanxi: 'shanxi-2025-benke.json',
  tianjin: 'tianjin-2025-benke.json',
  xinjiang: 'xinjiang-2025-benke.json',
  zhejiang: 'zhejiang-2025-benke.json'
};

// 只信任 Nginx 这一层代理；true 会信任任意 X-Forwarded-For，导致 IP 可伪造、限流失效
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

function makeLimiter({ windowMs, limit, message, skipFailedRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipFailedRequests,
    message: { error: message }
  });
}

// 生成报告：单次成本高（LLM + 搜索 + 2-4 分钟占用），从严；
// 失败的请求（4xx/5xx）不计入额度，避免用户在服务波动时被 429 锁死
const generateLimiter = makeLimiter({ windowMs: 10 * 60 * 1000, limit: 5, message: '生成请求过于频繁，请 10 分钟后再试', skipFailedRequests: true });
// 留言：防脚本灌库
const messagesLimiter = makeLimiter({ windowMs: 60 * 60 * 1000, limit: 5, message: '留言过于频繁，请稍后再试' });
// 管理接口：防口令暴力猜测
const adminLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, limit: 30, message: '管理接口请求过于频繁，请稍后再试' });
// 流程会话：页面加载建 1 次 + 表单变更防抖更新，正常用户远低于此
const advisorLimiter = makeLimiter({ windowMs: 10 * 60 * 1000, limit: 120, message: '会话请求过于频繁，请稍后再试' });

// 生成报告全局并发闸门：超出上限的请求排队最多 30 秒，队列满/等待超时快速失败（不动邀请码）。
// 排队上限 30 秒的依据：闸门等待 + 服务端 250 秒处理都发生在前端 260 秒超时之内。
const generateGate = createSemaphore({
  max: parseInt(process.env.GENERATE_MAX_CONCURRENT || '8', 10),
  queueMax: parseInt(process.env.GENERATE_QUEUE_MAX || '10', 10),
  waitMs: parseInt(process.env.GENERATE_QUEUE_WAIT_MS || '30000', 10)
});

// vendor 库随 npm 版本锁定，几乎不变，长缓存
const VENDOR_CACHE = { maxAge: '7d', immutable: true };
app.get('/vendor/html2canvas.min.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules/html2canvas/dist/html2canvas.min.js'), VENDOR_CACHE);
});

app.get('/vendor/pdf-lib.min.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules/pdf-lib/dist/pdf-lib.min.js'), VENDOR_CACHE);
});

// 静态前端：html/css/js 走协商缓存（随时可发新版，避免用户拿到新 HTML + 旧 CSS 的混搭），
// 只有大而少变的数据文件缓存 1 小时
app.use(express.static(path.join(__dirname, 'web'), {
  setHeaders(res, filePath) {
    if (/\.(html|css|js)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (/\.(json|txt|xml)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

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
  // 只认 header，token 走 query string 会进 Nginx 访问日志
  const provided = req.get('x-admin-token');
  if (provided !== adminToken) {
    return res.status(401).json({ error: '管理员口令不正确' });
  }
  next();
}

app.post('/api/messages', messagesLimiter, (req, res) => {
  try {
    const saved = getLocalDb().saveMessage({ ...req.body, ...clientMeta(req) });
    res.json({ ok: true, message: saved });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '留言保存失败' });
  }
});

app.get('/api/admin/messages', adminLimiter, requireAdmin, (req, res) => {
  try {
    res.json({ ok: true, messages: getLocalDb().listMessages({ limit: req.query.limit }) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '留言读取失败' });
  }
});

app.get('/api/admin/invite-codes', adminLimiter, requireAdmin, (req, res) => {
  try {
    res.json({ ok: true, inviteCodes: getLocalDb().listInviteCodes({ limit: req.query.limit }) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '邀请码读取失败' });
  }
});

app.post('/api/advisor-sessions', advisorLimiter, (req, res) => {
  try {
    const session = getLocalDb().createAdvisorSession(req.body?.data || {});
    res.json({ ok: true, session });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '志愿流程会话创建失败' });
  }
});

app.get('/api/advisor-sessions/:id', advisorLimiter, (req, res) => {
  try {
    res.json({ ok: true, session: getLocalDb().getAdvisorSession(req.params.id) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '志愿流程会话读取失败' });
  }
});

app.patch('/api/advisor-sessions/:id', advisorLimiter, (req, res) => {
  try {
    const session = getLocalDb().updateAdvisorSession(req.params.id, {
      currentStage: req.body?.currentStage,
      data: req.body?.data
    });
    res.json({ ok: true, session });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || '志愿流程会话更新失败' });
  }
});

app.get('/api/admission/:province', (req, res) => {
  const fileName = ADMISSION_FILES[req.params.province];
  if (!fileName) {
    return res.status(404).json({ error: '未找到该省份投档线数据' });
  }
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(path.join(__dirname, 'data/admission', fileName));
});

app.post('/api/admin/invite-codes', adminLimiter, requireAdmin, (req, res) => {
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

// API 路由（带超时保护 + 全局并发闸门）
app.post('/api/generate', generateLimiter, async (req, res) => {
  // 先拿并发槽位：拿不到快速失败，此时还没预占邀请码
  try {
    await generateGate.acquire();
  } catch (err) {
    return res.status(err.status || 503).json({ error: err.message });
  }

  let reservation = null;
  let timedOut = false;
  // 250 秒服务端超时（前端 260 秒余量之内，大于 Agent 195 秒内部预算）
  const reqTimeout = setTimeout(() => {
    timedOut = true;
    if (reservation) {
      getLocalDb().releaseInviteReservation(reservation.reservationId);
    }
    if (!res.headersSent) {
      res.status(504).json({ error: '服务端超时（250秒），请稍后重试。' });
    }
  }, 250000);

  try {
    const { generatePlan } = await import('./api/generate.js');
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
  } finally {
    generateGate.release();
  }
});

// 健康检查（含生成链路负载，便于运维观察）
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), generate: generateGate.stats() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[gaokao-advisor] running at http://0.0.0.0:${PORT}`);
  console.log(`[gaokao-advisor] search provider: ${process.env.SEARCH_PROVIDER || 'bing'}`);
  console.log(`[gaokao-advisor] deepseek model: ${process.env.DEEPSEEK_MODEL || 'deepseek-chat'}`);
});
