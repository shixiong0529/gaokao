const form = document.getElementById('planForm');
const submitBtn = document.getElementById('submitBtn');
const btnText = submitBtn.querySelector('.btn-text');
const btnLoading = submitBtn.querySelector('.btn-loading');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const errorEl = document.getElementById('error');
const reportFrame = document.getElementById('reportFrame');
const reportPreview = document.getElementById('reportPreview');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingTip = document.getElementById('loadingTip');
const loadingElapsed = document.getElementById('loadingElapsed');
const progressBar = document.getElementById('progressBar');
const advisorStageText = document.getElementById('advisorStageText');
const advisorStageBar = document.getElementById('advisorStageBar');
const majorInterestInputs = Array.from(document.querySelectorAll('input[name="majorInterest"]'));

let currentHtml = '';
let currentDocxBase64 = null;
let currentReportUrl = null;
let loadingTimer = null;
let elapsedTimer = null;
let startTime = 0;
let advisorSessionId = null;

const ADVISOR_STAGE_META = {
  basic_info: { label: '阶段一：基础信息收集中', pct: 16 },
  interest_profile: { label: '阶段二：专业兴趣待补充', pct: 32 },
  personal_profile: { label: '阶段三：个人画像待补充', pct: 48 },
  exploration: { label: '阶段四：偏好探索待开始', pct: 64 },
  draft_plan: { label: '阶段五：正在生成候选方案', pct: 82 },
  final_report: { label: '阶段六：最终报告已生成', pct: 100 }
};

// 进度提示文案（按时间推进，给用户感知）
const PROGRESS_TIPS = [
  { t: 0,   msg: 'AI 正在联网搜索院校数据，请耐心等待2分钟...' },
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
  const inviteCode = String(formData.get('inviteCode') || '').trim();
  const majorInterests = formData.getAll('majorInterest');
  const advisorPreferences = collectAdvisorPreferences(formData);

  if (reselect.length !== 2) {
    showError('请选择恰好 2 门再选科目');
    return;
  }

  if (!scoreVal) {
    showError('请填写高考分数');
    return;
  }

  if (!inviteCode) {
    showError('请输入邀请码');
    return;
  }

  const payload = {
    province: formData.get('province'),
    score: Number(scoreVal),
    rank: rankVal ? Number(rankVal) : null,
    firstChoice: formData.get('firstChoice'),
    reselect,
    preferences: buildPreferences(formData, advisorPreferences),
    inviteCode,
    sessionId: advisorSessionId
  };

  // UI 切换为加载态
  setLoading(true);
  hideError();
  resetReportPreview();
  resultEl.hidden = true;
  showLoading();

  try {
    await ensureAdvisorSession();
    payload.sessionId = advisorSessionId;
    await updateAdvisorSessionStage({
      currentStage: 'draft_plan',
      data: {
        province: payload.province,
        score: payload.score,
        rank: payload.rank,
        firstChoice: payload.firstChoice,
        reselect: payload.reselect,
        majorInterests,
        advisorPreferences,
        preferences: payload.preferences
      }
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 230000); // 230 秒超时

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
    await updateAdvisorSessionStage({
      currentStage: 'final_report',
      data: {
        reportGeneratedAt: new Date().toISOString(),
        meta: data.meta || null
      }
    });
    resultEl.hidden = false;
    renderReportPreview(data.html);
    hideLoading();
    scrollToReportResult();
  } catch (err) {
    if (err.name === 'AbortError') {
      showError('⏱ 请求超时（230秒）。AI 正在联网搜索院校数据，请稍后重试。建议不填"院校偏好"让 AI 自主筛选，可加快速度。');
    } else {
      showError(err.message || '生成失败，请检查网络或稍后重试');
    }
    hideLoading();
  } finally {
    setLoading(false);
  }
});

initAdvisorSession();
bindMajorInterestStage();

function setLoading(loading) {
  submitBtn.disabled = loading;
  btnText.hidden = loading;
  btnLoading.hidden = !loading;
}

function collectAdvisorPreferences(formData) {
  const single = (name) => String(formData.get(name) || '').trim();
  const multi = (name) => formData.getAll(name).map(value => String(value).trim()).filter(Boolean);

  return {
    majorInterests: multi('majorInterest'),
    cityPreference: single('cityPreference'),
    costPreference: single('costPreference'),
    cooperationPreference: single('cooperationPreference'),
    excludedOptions: multi('excludedOption'),
    priorityFactor: single('priorityFactor'),
    graduationGoal: single('graduationGoal'),
    learningStrengths: multi('learningStrength'),
    riskPreference: single('riskPreference'),
    strategyRatio: single('strategyRatio'),
    reportOptions: multi('reportOption'),
    reportLength: single('reportLength'),
    reportFocus: single('reportFocus'),
    freeformNotes: single('preferences')
  };
}

function buildPreferences(formData, advisorPreferences = collectAdvisorPreferences(formData)) {
  const text = String(formData.get('preferences') || '').trim();
  const lines = [];

  if (advisorPreferences.majorInterests.length) {
    lines.push(`专业兴趣：${advisorPreferences.majorInterests.join('、')}`);
  }
  if (advisorPreferences.cityPreference) {
    lines.push(`城市偏好：${advisorPreferences.cityPreference}`);
  }
  if (advisorPreferences.costPreference) {
    lines.push(`费用偏好：${advisorPreferences.costPreference}`);
  }
  if (advisorPreferences.cooperationPreference) {
    lines.push(`中外合作：${advisorPreferences.cooperationPreference}`);
  }
  if (advisorPreferences.excludedOptions.length) {
    lines.push(`明确排除：${advisorPreferences.excludedOptions.join('、')}`);
  }
  if (advisorPreferences.priorityFactor) {
    lines.push(`优先级：${advisorPreferences.priorityFactor}`);
  }
  if (advisorPreferences.graduationGoal) {
    lines.push(`毕业倾向：${advisorPreferences.graduationGoal}`);
  }
  if (advisorPreferences.learningStrengths.length) {
    lines.push(`学习优势：${advisorPreferences.learningStrengths.join('、')}`);
  }
  if (advisorPreferences.riskPreference) {
    lines.push(`风险偏好：${advisorPreferences.riskPreference}`);
  }
  if (advisorPreferences.strategyRatio) {
    lines.push(`冲稳保比例：${advisorPreferences.strategyRatio}`);
  }
  if (advisorPreferences.reportOptions.length) {
    lines.push(`报告内容要求：${advisorPreferences.reportOptions.join('、')}`);
  }
  if (advisorPreferences.reportLength) {
    lines.push(`报告长度：${advisorPreferences.reportLength}`);
  }
  if (advisorPreferences.reportFocus) {
    lines.push(`报告重点：${advisorPreferences.reportFocus}`);
  }
  if (text) {
    lines.push(`其他补充说明：${text}`);
  }

  if (lines.length > 1 && text) {
    lines.push('结构化选项与其他补充说明如有冲突，以结构化选项为准，并在报告中提示冲突。');
  }

  return lines.join('\n');
}

function bindMajorInterestStage() {
  majorInterestInputs.forEach(input => {
    input.addEventListener('change', async () => {
      const formData = new FormData(form);
      const majorInterests = formData.getAll('majorInterest');
      if (majorInterests.length === 0) {
        renderAdvisorStage('basic_info');
        return;
      }
      try {
        await ensureAdvisorSession();
        await updateAdvisorSessionStage({
          currentStage: 'interest_profile',
          data: { majorInterests }
        });
      } catch (err) {
        renderAdvisorStage('interest_profile');
      }
    });
  });
}

async function initAdvisorSession() {
  try {
    await ensureAdvisorSession();
  } catch (err) {
    renderAdvisorStage(null, '流程会话暂不可用，不影响一键生成');
  }
}

async function ensureAdvisorSession() {
  if (advisorSessionId) return advisorSessionId;
  const resp = await fetch('/api/advisor-sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: {} })
  });
  const body = await resp.json();
  if (!resp.ok) throw new Error(body.error || '流程会话创建失败');
  advisorSessionId = body.session.id;
  renderAdvisorStage(body.session.currentStage);
  return advisorSessionId;
}

async function updateAdvisorSessionStage(input) {
  if (!advisorSessionId) return null;
  try {
    const resp = await fetch(`/api/advisor-sessions/${encodeURIComponent(advisorSessionId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    const body = await resp.json();
    if (!resp.ok) throw new Error(body.error || '流程会话更新失败');
    renderAdvisorStage(body.session.currentStage);
    return body.session;
  } catch (err) {
    console.warn('[advisor-session] update failed:', err);
    return null;
  }
}

function renderAdvisorStage(stage, fallbackText) {
  if (!advisorStageText || !advisorStageBar) return;
  const meta = ADVISOR_STAGE_META[stage];
  advisorStageText.textContent = fallbackText || (meta ? meta.label : '阶段一：基础信息收集中');
  advisorStageBar.style.width = `${meta ? meta.pct : 16}%`;
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

function scrollToReportResult() {
  requestAnimationFrame(() => {
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ===== 报告预览 =====
function resetReportPreview() {
  if (currentReportUrl) {
    URL.revokeObjectURL(currentReportUrl);
    currentReportUrl = null;
  }
  reportFrame.removeAttribute('src');
  reportFrame.removeAttribute('srcdoc');
  reportPreview.innerHTML = '';
}

function renderReportPreview(html) {
  resetReportPreview();
  reportPreview.innerHTML = buildInlinePreviewHtml(html);

  if (window.Blob && window.URL && URL.createObjectURL) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    currentReportUrl = URL.createObjectURL(blob);
    reportFrame.src = currentReportUrl;
    return;
  }

  if ('srcdoc' in reportFrame) {
    reportFrame.srcdoc = html;
    return;
  }

  const doc = reportFrame.contentDocument || (reportFrame.contentWindow && reportFrame.contentWindow.document);
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
  }
}

function buildInlinePreviewHtml(html) {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const styles = Array.from(doc.head.querySelectorAll('style')).map(node => node.outerHTML).join('');
    const body = doc.body ? doc.body.innerHTML : html;
    return styles + body;
  } catch (e) {
    return html;
  }
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

// 保存为 PDF（前端直接生成文件下载，不打开浏览器打印页）
window.downloadPdf = async function() {
  if (!currentHtml) {
    showError('请先生成方案');
    return;
  }
  if (!window.html2canvas || !window.PDFLib) {
    showError('PDF 生成组件加载失败，请刷新页面后重试');
    return;
  }

  const exportRoot = document.createElement('div');
  exportRoot.style.position = 'fixed';
  exportRoot.style.left = '-10000px';
  exportRoot.style.top = '0';
  exportRoot.style.width = '900px';
  exportRoot.style.background = '#fff';
  exportRoot.innerHTML = buildInlinePreviewHtml(currentHtml);
  document.body.appendChild(exportRoot);

  try {
    const canvas = await window.html2canvas(exportRoot, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: 960,
      scrollY: 0
    });
    const pdfDoc = await window.PDFLib.PDFDocument.create();
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const pagePixelHeight = Math.floor(canvas.width * pageHeight / pageWidth);
    const sliceCanvas = document.createElement('canvas');
    const sliceCtx = sliceCanvas.getContext('2d');

    for (let y = 0; y < canvas.height; y += pagePixelHeight) {
      const sliceHeight = Math.min(pagePixelHeight, canvas.height - y);
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeight;
      sliceCtx.clearRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      sliceCtx.drawImage(canvas, 0, y, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      const png = await pdfDoc.embedPng(sliceCanvas.toDataURL('image/png'));
      const renderedHeight = sliceHeight * pageWidth / canvas.width;
      page.drawImage(png, {
        x: 0,
        y: pageHeight - renderedHeight,
        width: pageWidth,
        height: renderedHeight
      });
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildFilename('pdf');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    showError('PDF 保存失败：' + (e.message || '请稍后重试'));
  } finally {
    document.body.removeChild(exportRoot);
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
  if (currentReportUrl) {
    window.open(currentReportUrl, '_blank');
    return;
  }
  if (window.Blob && window.URL && URL.createObjectURL) {
    const blob = new Blob([currentHtml], { type: 'text/html;charset=utf-8' });
    currentReportUrl = URL.createObjectURL(blob);
    window.open(currentReportUrl, '_blank');
    return;
  }
  const w = window.open('', '_blank');
  w.document.write(currentHtml);
  w.document.close();
};
