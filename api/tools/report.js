// api/tools/report.js
// HTML 志愿方案报告生成器（七板块结构，对照专家标准）
// 输入：七板块结构化数据
// 输出：完整 HTML 字符串（可直接渲染或转 PDF）

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderValue(v) {
  if (v === null || v === undefined) return '<span style="color:#94a3b8;">未提供</span>';
  if (typeof v === 'number') return `<strong>${v}</strong>`;
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return `<strong>${escapeHtml(v)}</strong>`;
  return escapeHtml(String(v));
}

// 格式化分数：去掉已有的"分"后缀再统一补上，避免 LLM 把候选池文本里
// 已带"分"字的值原样复制（如"647分"）导致渲染成"647分分"
function formatScore(v) {
  if (v === null || v === undefined || v === '') return '-';
  const s = String(v).trim().replace(/分+$/, '');
  return s ? `${escapeHtml(s)}分` : '-';
}

// 数字字段的安全渲染：LLM 可能把数字字段输出成任意字符串，必须转义
function renderRank(rank) {
  if (rank === null || rank === undefined || rank === '') return '-';
  return typeof rank === 'number' ? rank.toLocaleString() : escapeHtml(String(rank));
}

function renderSource(source, url) {
  // 只放行 http/https：url 来自 LLM 输出（间接来自搜索到的网页），javascript: 等协议一律不渲染成链接
  const safeUrl = typeof url === 'string' && /^https?:\/\//i.test(url.trim()) ? url.trim() : '';
  if (safeUrl) return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener">${escapeHtml(source || safeUrl)}</a>`;
  return escapeHtml(source || '-');
}

export function generateReport(data) {
  const {
    candidate = {},
    executiveSummary = {},
    dataBasis = {},
    scoreAnalysis = {},
    tiers = [],
    schoolDetails = [],
    volunteerTable = [],
    riskChecklist = {},
    sources = [],
    provinceAuthority = null,
    usedLocalAdmission = false
  } = data || {};

  // 容错：确保数组字段真的是数组（防止 LLM 输出类型不符）
  const safeTiers = Array.isArray(tiers) ? tiers : [];
  const safeSchoolDetails = Array.isArray(schoolDetails) ? schoolDetails : [];
  const safeVolunteerTable = Array.isArray(volunteerTable) ? volunteerTable : [];
  const safeSources = Array.isArray(sources) ? sources : [];
  const safeExecSummary = (executiveSummary && typeof executiveSummary === 'object' && !Array.isArray(executiveSummary)) ? executiveSummary : {};
  const safeDataBasis = (dataBasis && typeof dataBasis === 'object' && !Array.isArray(dataBasis)) ? dataBasis : {};
  const safeScoreAnalysis = (scoreAnalysis && typeof scoreAnalysis === 'object' && !Array.isArray(scoreAnalysis)) ? scoreAnalysis : {};
  const safeRiskChecklist = (riskChecklist && typeof riskChecklist === 'object' && !Array.isArray(riskChecklist)) ? riskChecklist : {};

  const tagClass = { '冲': 'tag-red', '稳': 'tag-yellow', '保': 'tag-green' };
  const tierColor = { '冲': 'var(--red)', '稳': 'var(--yellow)', '保': 'var(--green)' };
  const tierIcon = { '冲': '🔴', '稳': '🟡', '保': '🟢' };
  const tierLabel = {
    '冲': '冲一冲（录取概率较低，但有希望）',
    '稳': '稳一稳（录取概率中等偏上）',
    '保': '保一保（录取概率高，兜底院校）'
  };

  // ===== 板块1：头部 =====
  const headerHtml = `
<div class="header">
  <h1>${escapeHtml(candidate.name || '考生')} · ${escapeHtml(candidate.province)}${escapeHtml(candidate.subjectType)}志愿填报参考方案</h1>
  <div class="subtitle">生成时间：${new Date().toLocaleString('zh-CN')} · 数据年份：${escapeHtml(dataBasis.yearLabel || '近年录取参考')} · 仅供参考，以官方发布为准</div>
  <div class="meta">
    <span class="meta-item">${escapeHtml(candidate.province)}省</span>
    <span class="meta-item">${escapeHtml(candidate.subjectType)}</span>
    <span class="meta-item">选科：${escapeHtml([candidate.firstChoice, ...(candidate.reselect || [])].filter(Boolean).join('+'))}</span>
    ${candidate.score ? `<span class="meta-item">总分${candidate.score}分</span>` : ''}
    ${candidate.rank ? `<span class="meta-item">位次约${Number(candidate.rank).toLocaleString()}</span>` : ''}
  </div>
</div>`;

  // ===== 板块2：执行摘要 =====
  const summaryRowsHtml = (safeExecSummary.rows || []).map(r =>
    `<tr><td>${escapeHtml(r.k)}</td><td>${renderValue(r.v)}</td></tr>`
  ).join('');
  const executiveSummaryHtml = `
<div class="card">
  <h2>一、执行摘要</h2>
  ${summaryRowsHtml ? `<table class="summary-table"><tr><th>项目</th><th>内容</th></tr>${summaryRowsHtml}</table>` : '<p>考生信息待补充</p>'}
  ${safeExecSummary.conclusion ? `<blockquote><strong>核心结论</strong>：${escapeHtml(safeExecSummary.conclusion)}</blockquote>` : ''}
</div>`;

  // ===== 板块3：数据基础 =====
  const batchLinesHtml = (safeDataBasis.batchLines || []).map(b =>
    `<tr><td><strong>${escapeHtml(String(b.year ?? '-'))}</strong></td><td>${escapeHtml(b.region)}</td><td>${escapeHtml(b.subject)}</td><td>${escapeHtml(b.batch)}</td><td><strong>${formatScore(b.score)}</strong></td><td>${renderRank(b.rank)}</td></tr>`
  ).join('');
  const schoolRefsHtml = (safeDataBasis.schoolRefs || []).map(s =>
    `<tr><td>${escapeHtml(s.name)}</td><td>${formatScore(s.score)}</td><td>${s.rank ? (typeof s.rank === 'number' ? s.rank.toLocaleString() : escapeHtml(s.rank)) : '-'}</td><td>${escapeHtml(s.nature || '-')}</td><td>${escapeHtml(s.type || '-')}</td></tr>`
  ).join('');
  const dataBasisHtml = `
<div class="card">
  <h2>二、数据基础</h2>
  ${batchLinesHtml ? `
  <h3>2.1 ${escapeHtml(candidate.province)}${escapeHtml(candidate.subjectType)}批次线</h3>
  <table><tr><th>年份</th><th>地区</th><th>选科</th><th>批次</th><th>分数线</th><th>对应位次</th></tr>${batchLinesHtml}</table>` : '<p>批次线数据待补充</p>'}
  ${schoolRefsHtml ? `
  <h3>2.2 院校录取参考数据</h3>
  ${safeDataBasis.note ? `<blockquote>${escapeHtml(safeDataBasis.note)}</blockquote>` : ''}
  <table><tr><th>院校名称</th><th>近年最低分</th><th>对应位次（约）</th><th>办学性质</th><th>类型</th></tr>${schoolRefsHtml}</table>` : ''}
  ${safeDataBasis.sourceNote ? `<blockquote>⚠️ ${escapeHtml(safeDataBasis.sourceNote)}</blockquote>` : ''}
</div>`;

  // ===== 板块4：分数定位分析 + 冲稳保策略 =====
  const analysisParas = (safeScoreAnalysis.paragraphs || []).map(p => `<p>${escapeHtml(p)}</p>`).join('');
  const tiersHtml = safeTiers.map(t => {
    const schools = Array.isArray(t.schools) ? t.schools : [];
    const schoolsHtml = schools.map(s =>
      `<tr><td>${escapeHtml(s.name)}</td><td>${formatScore(s.score)}</td><td>${escapeHtml(s.reason || '')}</td></tr>`
    ).join('');
    return `
    <div class="tier-section">
      <div class="tier-header" style="color:${tierColor[t.level] || 'var(--text)'};">
        ${tierIcon[t.level] || ''} ${escapeHtml(t.label || tierLabel[t.level] || t.level)}
      </div>
      <table><tr><th>院校名称</th><th>近年最低分</th><th>${escapeHtml(t.level || '')}的理由</th></tr>${schoolsHtml}</table>
    </div>`;
  }).join('');
  const groupExplainHtml = usedLocalAdmission ? `
  <blockquote>
    💡 <strong>「第 XX 组」是什么？</strong>下表院校名称后的编号是<strong>院校专业组</strong>——新高考不是直接填专业，而是先选"院校+专业组"，同一所大学会按选科要求把专业拆成好几个组（比如"计算机类"一组、"临床医学"一组），<strong>不同组的投档分数往往不同</strong>。表中投档线来自${escapeHtml(provinceAuthority?.name || candidate.province + '教育考试院')}官方公布的真实数据，精确到组，但<strong>组内具体包含哪些专业本页暂未标注</strong>，请用"潇湘高考"APP（考生本人账号登录）查询该专业组的完整专业清单后再确定填报顺序。
  </blockquote>` : '';
  const strategyHtml = `
<div class="card">
  <h2>三、志愿填报策略</h2>
  ${groupExplainHtml}
  ${analysisParas ? `<h3>3.1 分数定位分析</h3>${analysisParas}` : ''}
  ${tiersHtml ? `<h3>3.2 冲稳保三层策略</h3>${tiersHtml}` : '<p>策略数据待补充</p>'}
</div>`;

  // ===== 板块5：推荐院校详细分析 =====
  const schoolCardsHtml = safeSchoolDetails.map(s => {
    const cat = s.category || '';
    return `
    <div class="school-card" style="border-left-color:${tierColor[cat] || 'var(--line)'};">
      <h4>${escapeHtml(s.name)} ${cat ? `<span class="tag ${tagClass[cat] || ''}">${escapeHtml(cat)}</span>` : ''}</h4>
      <div class="school-meta">
        <div>📍 <strong>所在地</strong>：${escapeHtml(s.location || '-')}</div>
        <div>🏫 <strong>类型</strong>：${escapeHtml(s.type || '-')} · ${escapeHtml(s.ownership || '-')}</div>
        <div>📊 <strong>近年最低分</strong>：${formatScore(s.minScore)}${s.rank ? `（位次${typeof s.rank === 'number' ? '约' + s.rank.toLocaleString() : escapeHtml(s.rank)}）` : ''}</div>
        <div>🎓 <strong>硕士点</strong>：${escapeHtml(s.hasMaster || '-')}</div>
      </div>
      <div class="analysis">${escapeHtml(s.strengths ? '优势学科：' + s.strengths + '。' : '')}${escapeHtml(s.analysis || '分析待补充')}</div>
    </div>`;
  }).join('');
  const detailsHtml = schoolCardsHtml ? `
<div class="card">
  <h2>四、推荐院校详细分析</h2>
  ${schoolCardsHtml}
</div>` : '';

  // ===== 板块6：建议志愿表 =====
  const volunteerRowsHtml = safeVolunteerTable.map(v => {
    const cat = v.category || '';
    return `<tr><td>${escapeHtml(String(v.order ?? ''))}</td><td>${cat ? `<span class="tag ${tagClass[cat] || ''}">${escapeHtml(cat)}</span>` : ''}</td><td>${escapeHtml(v.college || '')}</td><td>${escapeHtml(v.city || '')}</td><td>${formatScore(v.refScore)}</td><td>${escapeHtml(v.transfer || '-')}</td></tr>`;
  }).join('');
  const volunteerHtml = volunteerRowsHtml ? `
<div class="card">
  <h2>五、建议志愿表</h2>
  <blockquote>⚠️ 以下为参考方案${usedLocalAdmission ? '（院校名称后的编号为真实专业组，投档线为官方数据）' : ''}，具体专业组内含哪些专业、招生人数与选科要求，须以${escapeHtml(provinceAuthority?.name || candidate.province + '教育考试院')}${usedLocalAdmission ? '「潇湘高考」APP 或' : ''}当年官方招生计划手册为准。</blockquote>
  <table><tr><th>序号</th><th>冲稳保</th><th>院校名称</th><th>所在地</th><th>近年参考分</th><th>建议服从调剂</th></tr>${volunteerRowsHtml}</table>
</div>` : '';

  // ===== 板块7：风险提醒 =====
  const riskSections = [
    { title: '6.1 数据时效性', items: safeRiskChecklist.timeliness },
    { title: '6.2 选科匹配', items: safeRiskChecklist.subjectMatch },
    { title: '6.3 专业调剂建议', items: safeRiskChecklist.transfer },
    { title: '6.4 特殊类型招生', items: safeRiskChecklist.specialAdmission },
    { title: '6.5 单科成绩关注', items: safeRiskChecklist.subjectScore }
  ].filter(s => s.items && s.items.length > 0);
  const riskHtml = riskSections.length ? `
<div class="card">
  <h2>六、风险提醒与注意事项</h2>
  ${riskSections.map(s => `
    <h3>${escapeHtml(s.title)}</h3>
    <ul style="margin-left:20px; margin-bottom:10px;">
      ${(s.items || []).map(i => `<li>${escapeHtml(i)}</li>`).join('')}
    </ul>`).join('')}
</div>` : '';

  // ===== 板块8：来源与时效声明 =====
  const sourcesRowsHtml = safeSources.map(s =>
    `<tr><td>${escapeHtml(s.item || '-')}</td><td>${renderSource(s.source, s.url)}</td><td>${escapeHtml(String(s.year || '-'))}</td><td>${escapeHtml(s.collectedAt || '-')}</td></tr>`
  ).join('');
  const sourcesHtml = sourcesRowsHtml ? `
<div class="card">
  <h2>七、来源与时效声明</h2>
  <table><tr><th>数据项</th><th>来源</th><th>采集年份</th><th>采集时间</th></tr>${sourcesRowsHtml}</table>
  <div class="disclaimer">
    以上信息基于当前可检索数据整理，仅供参考，不构成最终志愿填报建议。高考招生政策、招生计划、投档线和录取结果以各省级招生考试机构及高校官方发布为准。最终决定请你和家人结合官方信息综合判断。
  </div>
</div>` : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(candidate.name || '考生')} · ${escapeHtml(candidate.province)}${escapeHtml(candidate.subjectType)}志愿填报参考方案</title>
<style>
:root {
  --bg: #f8f9fa;
  --card: #ffffff;
  --text: #1f2937;
  --muted: #6b7280;
  --accent: #2563eb;
  --accent-light: #eff6ff;
  --line: #e5e7eb;
  --shadow: 0 4px 12px rgba(0,0,0,.06);
  --red: #dc2626;
  --yellow: #d97706;
  --green: #16a34a;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Noto Sans CJK SC', sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.8;
  padding: 20px;
}
.container { max-width: 1400px; margin: 0 auto; }
.header {
  background: var(--card);
  border-radius: 12px;
  padding: 32px;
  margin-bottom: 20px;
  box-shadow: var(--shadow);
  border-top: 4px solid var(--accent);
}
.header h1 { font-size: 24px; color: var(--text); margin-bottom: 8px; }
.header .subtitle { color: var(--muted); font-size: 14px; }
.header .meta { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; }
.header .meta-item {
  background: var(--accent-light);
  color: var(--accent);
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 13px;
}
.card {
  background: var(--card);
  border-radius: 12px;
  padding: 28px;
  margin-bottom: 20px;
  box-shadow: var(--shadow);
}
.card h2 {
  font-size: 18px;
  border-left: 4px solid var(--accent);
  padding-left: 12px;
  margin-bottom: 16px;
}
.card h3 {
  font-size: 16px;
  margin-top: 20px;
  margin-bottom: 12px;
  color: var(--text);
}
.card p { margin-bottom: 10px; }
table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 14px;
}
th {
  background: var(--accent-light);
  color: var(--accent);
  font-weight: 600;
  padding: 10px 12px;
  text-align: left;
  border-bottom: 2px solid var(--accent);
}
td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
}
tr:hover td { background: #f9fafb; }
.tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.tag-red { background: #fef2f2; color: var(--red); }
.tag-yellow { background: #fffbeb; color: var(--yellow); }
.tag-green { background: #f0fdf4; color: var(--green); }
.tag-blue { background: var(--accent-light); color: var(--accent); }
blockquote {
  background: #fffbeb;
  border-left: 4px solid var(--yellow);
  padding: 12px 16px;
  border-radius: 8px;
  margin: 12px 0;
  font-size: 14px;
  color: #92400e;
}
.disclaimer {
  background: #fef2f2;
  border-left: 4px solid var(--red);
  padding: 16px 20px;
  border-radius: 8px;
  margin-top: 20px;
  font-size: 13px;
  color: #991b1b;
}
.summary-table th { background: var(--accent); color: white; }
.summary-table td:first-child { font-weight: 600; }
.tier-section { margin-bottom: 20px; }
.tier-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 16px;
  font-weight: 700;
}
.tier-red { color: var(--red); }
.tier-yellow { color: var(--yellow); }
.tier-green { color: var(--green); }
.school-card {
  background: var(--bg);
  border-radius: 8px;
  padding: 16px 20px;
  margin-bottom: 12px;
  border-left: 3px solid var(--line);
}
.school-card h4 { font-size: 15px; margin-bottom: 8px; }
.school-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 8px;
  font-size: 13px;
  color: var(--muted);
}
.school-meta strong { color: var(--text); }
.analysis {
  font-size: 13px;
  color: var(--muted);
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--line);
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
@media (max-width: 600px) {
  body { padding: 10px; }
  .header, .card { padding: 16px; }
  table { font-size: 12px; }
  th, td { padding: 6px 8px; }
}
@media print { body { background: #fff; padding: 0; } }
</style>
</head>
<body>
<div class="container">
${headerHtml}
${executiveSummaryHtml}
${dataBasisHtml}
${strategyHtml}
${detailsHtml}
${volunteerHtml}
${riskHtml}
${sourcesHtml}
</div>
</body>
</html>`;
}
