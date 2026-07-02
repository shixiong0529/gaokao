// api/tools/localAdmission.js
// 本地投档线数据：各省官方公布的院校专业组投档线（免费、权威）
// 目前覆盖：湖南 2025 本科批（普通类），data/admission/hunan-2025-benke.json
//
// 设计要点（避免撑爆 LLM 输出）：
//   - 这里做的是"输入侧"数据处理：按考生等效分把 5000+ 条投档线初筛成
//     冲/稳/保各十几个候选，只把候选池喂给 LLM。
//   - LLM 只负责解读、精选、排序，输出仍是精选七板块，长度不变。

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// province → 本地投档线文件（后续扩省在此登记）
const LOCAL_FILES = {
  '湖南': path.join(__dirname, '../../data/admission/hunan-2025-benke.json')
};

const _cache = {};
function load(province) {
  if (_cache[province]) return _cache[province];
  const file = LOCAL_FILES[province];
  if (!file) return null;
  try {
    _cache[province] = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(`[localAdmission] 加载 ${province} 投档线失败: ${e.message}`);
    _cache[province] = [];
  }
  return _cache[province];
}

// 关联 web/colleges.json 的办学性质（公办/民办/中外合作），用于候选池优先公办
let _natureMap = null;
function schoolMeta(name) {
  if (!_natureMap) {
    _natureMap = new Map();
    try {
      const arr = JSON.parse(fs.readFileSync(path.join(__dirname, '../../web/colleges.json'), 'utf8'));
      for (const c of arr) if (!_natureMap.has(c.name)) _natureMap.set(c.name, { nature: c.nature, tags: c.tags || [] });
    } catch (e) { /* colleges.json 不存在时降级：不标注性质 */ }
  }
  return _natureMap.get(name) || { nature: '', tags: [] };
}
const NATURE_RANK = { '公办': 0, '中外合作': 1, '民办': 2 };
const natureRank = (n) => (n in NATURE_RANK ? NATURE_RANK[n] : 3);

/** 是否有该省的本地投档线数据 */
export function hasLocalAdmission(province) {
  return !!LOCAL_FILES[province];
}

/**
 * 按考生等效分初筛冲/稳/保候选专业组
 * @param {Object} p
 * @param {string} p.province     省份
 * @param {string} p.subjectType  科类，如"物理类"/"历史类"
 * @param {number} p.equivScore   考生等效分（已换算到本地数据年份口径）
 * @param {number} [p.perTier=12] 每档最多返回多少个专业组
 * @returns {null|{subject, equivScore, dataYear, total, tiers:{冲:[],稳:[],保:[]}}}
 */
export function queryLocalCandidates({ province, subjectType, equivScore, perTier = 12 }) {
  const data = load(province);
  if (!data || !data.length || !equivScore) return null;

  const subject = (subjectType || '').includes('历史') ? '历史' : '物理';
  const rows = data.filter(r => r['科类'] === subject && typeof r['投档线'] === 'number');
  if (!rows.length) return null;

  // diff = 投档线 - 等效分；>0 表示投档线高于考生（要冲），<0 表示低于考生（稳/保）
  const scored = rows.map(r => {
    const meta = schoolMeta(r['院校名称']);
    return {
      school: r['院校名称'],
      group: r['专业组名称'],
      groupNo: r['专业组编号'],
      score: r['投档线'],
      note: r['备注'] || '',
      nature: meta.nature,
      tags: meta.tags,
      diff: r['投档线'] - equivScore
    };
  });

  // 冲：投档线高于等效分 0~12 分；稳：-8~0；保：-30~-8
  const SPECIAL = /民族班|专项|预科|定向/; // 有资格门槛的特殊组，普通考生默认不推荐
  const maxPerSchool = 2; // 同一院校最多保留 2 个专业组：兼顾院校多样性与同校梯度（冲/稳）
  const pick = (lo, hi) => {
    const inRange = scored
      .filter(r => r.diff > lo && r.diff <= hi && !SPECIAL.test(r.group))
      .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff)); // 先按接近程度排
    const perSchool = new Map();
    const out = [];
    for (const r of inRange) {
      const c = perSchool.get(r.school) || 0;
      if (c >= maxPerSchool) continue;
      perSchool.set(r.school, c + 1);
      out.push(r);
    }
    // 同档内：公办优先，其次按投档线从高到低
    return out
      .sort((a, b) => natureRank(a.nature) - natureRank(b.nature) || b.score - a.score)
      .slice(0, perTier);
  };

  return {
    subject,
    equivScore,
    dataYear: 2025,
    total: rows.length,
    tiers: {
      '冲': pick(0, 12),
      '稳': pick(-8, 0),
      '保': pick(-30, -8)
    }
  };
}

/**
 * 把候选池格式化成注入 user message 的文本（给 LLM 参考，不是最终输出）
 */
export function formatLocalCandidates(cand, equivNote = '') {
  if (!cand) return '';
  const line = (r) => `- ${r.school}${r.nature ? '[' + r.nature + ']' : ''}${r.tags && r.tags.length ? '(' + r.tags.join('/') + ')' : ''} ${r.group} ${r.score}分${r.note ? '（' + r.note + '）' : ''}`;
  const block = (label, tip, arr) =>
    `【${label}】${tip}\n` + (arr.length ? arr.map(line).join('\n') : '（此档暂无匹配，可放宽）');

  return `## 湖南本科批真实投档线候选池（${cand.dataYear} 年官方投档线，精确到院校专业组，已按你的等效分初筛）
考生等效分：约 ${cand.equivScore} 分 ${equivNote}
${block('冲', '投档线高于你的等效分，够一够', cand.tiers['冲'])}
${block('稳', '投档线与你相当', cand.tiers['稳'])}
${block('保', '投档线明显低于你，兜底', cand.tiers['保'])}

（以上为湖南省教育考试院官方公布的 ${cand.dataYear} 年本科批平行志愿投档线，真实、精确到院校专业组。候选已标注办学性质：请**优先推荐公办院校**；民办/独立学院学费较高（通常 1.5–3 万/年），仅作兜底并需提醒考生学费。请从候选池挑选，volunteerTable 直接引用这些真实的院校专业组与投档线，无需再联网搜索湖南院校录取分。）`;
}
