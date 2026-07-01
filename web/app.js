const form = document.getElementById('planForm');
const submitBtn = document.getElementById('submitBtn');
const btnText = submitBtn.querySelector('.btn-text');
const btnLoading = submitBtn.querySelector('.btn-loading');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const errorEl = document.getElementById('error');
const reportFrame = document.getElementById('reportFrame');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingTip = document.getElementById('loadingTip');
const loadingElapsed = document.getElementById('loadingElapsed');
const progressBar = document.getElementById('progressBar');

let currentHtml = '';
let currentDocxBase64 = null;
let loadingTimer = null;
let elapsedTimer = null;
let startTime = 0;

// 进度提示文案（按时间推进，给用户感知）
const PROGRESS_TIPS = [
  { t: 0,   msg: 'AI 正在联网搜索院校数据，请耐心等待...' },
  { t: 15,  msg: '正在搜索录取分数线和位次数据...' },
  { t: 30,  msg: '分析院校选科要求，匹配考生选科组合...' },
  { t: 50,  msg: '搜索结果较多，正在综合分析近三年录取数据...' },
  { t: 75,  msg: '正在生成冲稳保分层志愿方案...' },
  { t: 100, msg: '即将完成，正在整理 HTML 报告...' },
  { t: 150, msg: '⏳ 耗时较长，但仍在正常工作。如急需可刷新页面重试（建议先等待）...' }
];

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(form);
  const reselect = formData.getAll('reselect');
  const scoreVal = formData.get('score');
  const rankVal = formData.get('rank');

  if (reselect.length !== 2) {
    showError('请选择恰好 2 门再选科目');
    return;
  }

  if (!scoreVal) {
    showError('请填写高考分数');
    return;
  }

  const payload = {
    province: formData.get('province'),
    score: Number(scoreVal),
    rank: rankVal ? Number(rankVal) : null,
    firstChoice: formData.get('firstChoice'),
    reselect,
    preferences: formData.get('preferences') || ''
  };

  // UI 切换为加载态
  setLoading(true);
  hideError();
  resultEl.hidden = true;
  showLoading();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 180 秒超时

    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error || `请求失败 ${resp.status}`);
    }

    currentHtml = data.html;
    currentDocxBase64 = data.docxBase64;
    reportFrame.srcdoc = data.html;
    resultEl.hidden = false;
    hideLoading();
  } catch (err) {
    if (err.name === 'AbortError') {
      showError('⏱ 请求超时（180秒）。AI 正在联网搜索院校数据，请稍后重试。建议不填"院校偏好"让 AI 自主筛选，可加快速度。');
    } else {
      showError(err.message || '生成失败，请检查网络或稍后重试');
    }
    hideLoading();
  } finally {
    setLoading(false);
  }
});

function setLoading(loading) {
  submitBtn.disabled = loading;
  btnText.hidden = loading;
  btnLoading.hidden = !loading;
}

// ===== Loading 动画与超时提示 =====
function showLoading() {
  loadingOverlay.hidden = false;
  startTime = Date.now();

  // 计时器
  elapsedTimer = setInterval(() => {
    const sec = Math.floor((Date.now() - startTime) / 1000);
    loadingElapsed.textContent = `已用时 ${sec} 秒`;

    // 90 秒后标黄提醒
    if (sec >= 90) {
      loadingElapsed.classList.add('timeout');
    } else {
      loadingElapsed.classList.remove('timeout');
    }

    // 进度条（非线性的视觉进度，最多到 92%，剩余留给实际完成）
    const pct = Math.min(92, 8 + sec * 0.9);
    progressBar.style.width = pct + '%';
  }, 1000);

  // 文案轮播
  updateTip();
  loadingTimer = setInterval(updateTip, 5000);
}

function updateTip() {
  const sec = Math.floor((Date.now() - startTime) / 1000);
  // 找到当前应显示的文案
  let tip = PROGRESS_TIPS[0].msg;
  for (const p of PROGRESS_TIPS) {
    if (sec >= p.t) tip = p.msg;
  }
  loadingTip.textContent = tip;
}

function hideLoading() {
  loadingOverlay.hidden = true;
  if (loadingTimer) { clearInterval(loadingTimer); loadingTimer = null; }
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
  loadingElapsed.classList.remove('timeout');
  progressBar.style.width = '0%';
}

// ===== 状态/错误（保留） =====
function showStatus(msg, active) {
  statusEl.textContent = msg;
  statusEl.hidden = false;
  statusEl.classList.toggle('active', !!active);
}

function hideStatus() {
  statusEl.hidden = true;
}

function showError(msg) {
  errorEl.textContent = '❌ ' + msg;
  errorEl.hidden = false;
}

function hideError() {
  errorEl.hidden = true;
}

// ===== 下载功能 =====
function buildFilename(ext) {
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return `高考志愿方案_${dateStr}.${ext}`;
}

// 下载 Word（docx）
window.downloadDocx = async function() {
  if (!currentDocxBase64) {
    showError('Word 文件未生成，请重新提交生成方案');
    return;
  }
  try {
    // 通过后端端点转 blob 下载
    const resp = await fetch('/api/download-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docxBase64: currentDocxBase64, filename: buildFilename('docx') })
    });
    if (!resp.ok) throw new Error('下载失败');
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildFilename('docx');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    showError('Word 下载失败：' + e.message);
  }
};

// 保存为 PDF（通过浏览器原生打印对话框，用户选"另存为 PDF"）
window.downloadPdf = function() {
  if (!currentHtml) {
    showError('请先生成方案');
    return;
  }
  // 在隐藏 iframe 中打印，触发浏览器"另存为 PDF"
  const frame = document.getElementById('reportFrame');
  try {
    frame.contentWindow.focus();
    frame.contentWindow.print();
  } catch (e) {
    // 兜底：新窗口打开让用户手动 Ctrl+P
    const w = window.open('', '_blank');
    w.document.write(currentHtml);
    w.document.close();
    setTimeout(() => w.print(), 800);
  }
};

// 下载 HTML
window.downloadHtml = function() {
  if (!currentHtml) return;
  const blob = new Blob([currentHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = buildFilename('html');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// 新窗口打开
window.openReport = function() {
  if (!currentHtml) return;
  const w = window.open('', '_blank');
  w.document.write(currentHtml);
  w.document.close();
};
