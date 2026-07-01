import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态前端
app.use(express.static(path.join(__dirname, 'web')));

// API 路由（带超时保护）
app.post('/api/generate', async (req, res) => {
  // 200 秒服务端超时（前端 180 秒 + 20 秒余量）
  const reqTimeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: '服务端超时（200秒），请稍后重试。' });
    }
  }, 200000);

  const { generatePlan } = await import('./api/generate.js');
  try {
    const result = await generatePlan(req.body);
    clearTimeout(reqTimeout);
    if (!res.headersSent) {
      res.json(result);
    }
  } catch (err) {
    clearTimeout(reqTimeout);
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
