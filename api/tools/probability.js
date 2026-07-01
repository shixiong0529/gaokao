// api/tools/probability.js
// 录取概率计算：基于位次比 k = R_school / R_user（位次越小越好）
// k < 1：院校位次更高（更难），k > 1：院校位次更低（更易）
// 输入：考生位次、院校近 2-3 年录取位次区间
// 输出：录取概率 + 冲/稳/保 分类 + k 值 + 判定依据

/**
 * 计算单所院校的录取概率（k 算法）
 * @param {Object} params
 * @param {number} params.candidateRank - 考生位次（全省排名）
 * @param {Array<{year:number, minRank:number, maxRank:number}>} params.history - 近 2-3 年录取位次
 * @returns {{probability:number, category:string, basis:string, k:number, historyRange:Object}}
 */
export function calculateProbability({ candidateRank, history }) {
  if (!history || history.length === 0) {
    return { probability: null, category: '数据不足', basis: '无历史位次数据', k: null, historyRange: null };
  }

  const validHistory = history.filter(h => h.minRank && h.maxRank);
  if (validHistory.length === 0) {
    return { probability: null, category: '数据不足', basis: '历史位次数据不完整', k: null, historyRange: null };
  }

  // 加权位次：近1年:近2年:近3年 = 0.5:0.3:0.2（年份越近权重越高）
  const sorted = [...validHistory].sort((a, b) => b.year - a.year);
  const weights = [0.5, 0.3, 0.2];
  const refRank = Math.round(
    sorted.slice(0, 3).reduce((s, h, i) => {
      const w = weights[i] ?? 0;
      return s + ((h.minRank + h.maxRank) / 2) * w;
    }, 0)
  );

  // k = R_school / R_user（位次越小越好；k<1 表示院校更难）
  const k = refRank / candidateRank;
  let probability;
  let category;
  let basis;

  if (k < 0.80) {
    // 院校位次远高于考生 → 不建议
    category = '不建议';
    probability = Math.max(0, Math.round(k * 30));
    basis = `k=${k.toFixed(2)} 院校位次远高于考生（${refRank.toLocaleString()} vs ${candidateRank.toLocaleString()}），风险过高`;
  } else if (k < 0.95) {
    // 冲：院校位次高于考生，有希望但不稳
    category = '冲';
    probability = Math.round(15 + (k - 0.80) / 0.15 * 15); // 15-30
    basis = `k=${k.toFixed(2)} 院校位次高于考生（${refRank.toLocaleString()} vs ${candidateRank.toLocaleString()}），有希望但不稳`;
  } else if (k <= 1.08) {
    // 稳：与考生位次相当或略优
    category = '稳';
    probability = Math.round(30 + (k - 0.95) / 0.13 * 45); // 30-75
    basis = `k=${k.toFixed(2)} 与考生位次相当（${refRank.toLocaleString()} vs ${candidateRank.toLocaleString()}），大概率稳`;
  } else {
    // 保：明显低于考生位次，兜底
    category = '保';
    probability = Math.min(95, Math.round(75 + (k - 1.08) * 20));
    basis = `k=${k.toFixed(2)} 明显低于考生位次（${refRank.toLocaleString()} vs ${candidateRank.toLocaleString()}），兜底`;
  }

  return {
    probability: Math.max(0, Math.min(95, probability)),
    category,
    basis,
    k: Number(k.toFixed(2)),
    historyRange: {
      minRank: Math.min(...sorted.map(h => h.minRank)),
      maxRank: Math.max(...sorted.map(h => h.maxRank)),
      years: sorted.map(h => h.year)
    }
  };
}

/**
 * 选科要求匹配校验
 * @param {Object} candidate - 考生选科 { firstChoice: '物理'|'历史', reselect: ['化学','生物'] }
 * @param {Object} requirement - 院校专业组要求 { firstRequired: '物理'|'历史'|'不限', reselectRequired: ['化学'] }
 * @returns {{matched:boolean, reason:string}}
 */
export function matchSubjectRequirement(candidate, requirement) {
  // 首选科目校验
  if (requirement.firstRequired && requirement.firstRequired !== '不限') {
    if (candidate.firstChoice !== requirement.firstRequired) {
      return {
        matched: false,
        reason: `该专业组要求首选${requirement.firstRequired}，考生首选${candidate.firstChoice}，不可填报`
      };
    }
  }

  // 再选科目校验（要求的所有再选科目，考生都必须选了）
  if (requirement.reselectRequired && requirement.reselectRequired.length > 0) {
    const missing = requirement.reselectRequired.filter(s => !candidate.reselect.includes(s));
    if (missing.length > 0) {
      return {
        matched: false,
        reason: `该专业组要求再选含${missing.join('、')}，考生再选为${candidate.reselect.join('、')}，不可填报`
      };
    }
  }

  return { matched: true, reason: '选科符合要求' };
}
