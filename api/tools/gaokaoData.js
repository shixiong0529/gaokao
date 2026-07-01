// api/tools/gaokaoData.js
// 高考结构化数据接口封装（参考腾讯元宝高考通接口）
// 两个能力：一分一段查询（score→rank）、批次线查询
// 注意：该接口目前无需鉴权，但来源标识 from=open_tB0fU5wP 不可改动
// 商用前请确认接口使用条款，必要时联系数据提供方获取正式授权

const BASE_URL = 'https://gaokao.search.qq.com/skills_data';
const SOURCE = 'open_tB0fU5wP';
// 结构化接口单次请求超时，防止预取阶段卡死
const GAOKAO_TIMEOUT_MS = parseInt(process.env.GAOKAO_TIMEOUT_MS || '8000', 10);

async function fetchWithTimeout(url, opts = {}, timeoutMs = GAOKAO_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 一分一段查询：分数 → 位次（或获取完整一分一段表）
 * @param {Object} params
 * @param {string} params.place - 省份，如"湖南"
 * @param {string} [params.year] - 年份，如"2025"；不传则取最近已发布年份
 * @param {string} [params.classify] - 选科：物理/历史/综合/文科/理科（按省份高考模式）
 * @param {number} [params.score] - 分数；传了返回该分数的同分人数和位次
 * @returns {Promise<Object>} { year, place, classify, score, sameCount, rank, raw }
 */
export async function queryScoreToRank({ place, year, classify, score }) {
  const params = new URLSearchParams({
    type: 'score_range',
    from: SOURCE,
    title: '高考;一分一段表'
  });
  if (year) params.set('year', year);
  if (place) params.set('place', place);
  if (classify) params.set('classify', classify);

  const url = `${BASE_URL}?${params.toString()}`;
  console.log('[gaokaoData] score_range:', url);

  const resp = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!resp.ok) throw new Error(`一分一段接口 HTTP ${resp.status}`);
  const data = await resp.json();

  if (data.status !== 0) {
    throw new Error(`一分一段接口错误: ${data.message || '未知'}`);
  }

  const records = data.data?.score_range_res || [];
  if (records.length === 0) {
    return { year, place, classify, score, sameCount: null, rank: null, raw: null, note: '当前数据源未返回该年份数据' };
  }

  // records 是按年份分组的数组，取第一个
  const record = records[0];
  const dataYear = record['查询分数线年份'];
  const subjectLabel = record['选科类别'];
  const rows = record['查询数据'] || [];

  // 如果传了 score，定位到对应分数行
  if (score != null) {
    const target = rows.find(r => Number(r['返回的查询分数']) === score);
    if (target) {
      return {
        year: dataYear,
        place,
        classify: subjectLabel,
        score,
        sameCount: Number(target['同分人数']),
        rank: Number(target['排名位次']),
        raw: target
      };
    }
    // 一分一段表里没精确命中，找最近的分数段（如 690-750 这种区间）
    const rangeRow = rows.find(r => {
      const s = String(r['返回的查询分数']);
      if (s.includes('-')) {
        const [lo, hi] = s.split('-').map(Number);
        return score >= lo && score <= hi;
      }
      return false;
    });
    if (rangeRow) {
      return {
        year: dataYear,
        place,
        classify: subjectLabel,
        score,
        sameCount: Number(rangeRow['同分人数']),
        rank: Number(rangeRow['排名位次']),
        raw: rangeRow,
        note: `分数落在区间 ${rangeRow['返回的查询分数']}`
      };
    }
    return { year: dataYear, place, classify: subjectLabel, score, sameCount: null, rank: null, raw: null, note: '一分一段表未命中该分数' };
  }

  // 没传 score，返回最近年份概要（最高分/最低分/总人数）
  return {
    year: dataYear,
    place,
    classify: subjectLabel,
    score: null,
    sameCount: null,
    rank: null,
    raw: { totalRows: rows.length, first: rows[0], last: rows[rows.length - 1] },
    note: `共 ${rows.length} 条一分一段记录`
  };
}

/**
 * 批次线查询：省份+年份+选科 → 各批次分数线
 * @param {Object} params
 * @param {string} params.place - 省份
 * @param {string} [params.year] - 年份
 * @param {string} [params.student] - 选科：物理/历史/综合/文科/理科
 * @returns {Promise<Object>} { year, place, student, batchLines:[{batch, score, rank, category}], raw }
 */
export async function queryBatchLines({ place, year, student }) {
  const params = new URLSearchParams({
    type: 'province_score_line',
    from: SOURCE
  });
  if (place) params.set('place', place);
  if (year) params.set('year', year);
  if (student) params.set('student', student);

  const url = `${BASE_URL}?${params.toString()}`;
  console.log('[gaokaoData] province_score_line:', url);

  const resp = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!resp.ok) throw new Error(`批次线接口 HTTP ${resp.status}`);
  const data = await resp.json();

  if (data.status !== 0) {
    throw new Error(`批次线接口错误: ${data.message || '未知'}`);
  }

  const records = data.data?.['地区分数线'] || [];
  if (records.length === 0) {
    return { year, place, student, batchLines: [], raw: null, note: '当前数据源未返回该年份数据' };
  }

  // 按"分数查询年份"分组，取第一组（最近年份）
  const firstYear = records[0]['分数查询年份'];
  const sameYearRecords = records.filter(r => r['分数查询年份'] === firstYear);

  const batchLines = sameYearRecords.map(r => ({
    year: r['分数查询年份'],
    region: r['分数线所属地区'],
    batch: r['录取批次'],
    score: Number(r['分数']),
    rank: Number(r['位次']),
    category: r['考生类别']
  }));

  return {
    year: firstYear,
    place,
    student,
    batchLines,
    raw: sameYearRecords
  };
}

/**
 * 省份高考模式判断（用于自动推断选科字段 classify/student）
 * @param {string} place - 省份
 * @param {number} year - 年份
 * @returns {{mode: 'old'|'3+3'|'3+1+2', classifyField: 'classify'|'student', defaultSubject: string}}
 */
export function getProvinceMode(place, year) {
  // 各省新高考切换年份
  const switchYear = {
    '上海': 2017, '浙江': 2017,
    '北京': 2020, '天津': 2020, '山东': 2020, '海南': 2020,
    '河北': 2021, '辽宁': 2021, '江苏': 2021, '福建': 2021, '湖北': 2021, '湖南': 2021, '广东': 2021, '重庆': 2021,
    '甘肃': 2024, '吉林': 2024, '黑龙江': 2024, '安徽': 2024, '江西': 2024, '贵州': 2024, '广西': 2024,
    '山西': 2025, '内蒙古': 2025, '河南': 2025, '四川': 2025, '云南': 2025, '陕西': 2025, '青海': 2025, '宁夏': 2025
  };

  // 3+3 模式省份
  const is3x3 = ['上海', '浙江', '北京', '天津', '山东', '海南'].includes(place);

  if (!switchYear[place] || year < switchYear[place]) {
    return { mode: 'old', classifyField: 'classify', defaultSubject: '理科' };
  }
  if (is3x3) {
    return { mode: '3+3', classifyField: 'classify', defaultSubject: '综合' };
  }
  return { mode: '3+1+2', classifyField: 'classify', defaultSubject: '物理' };
}
