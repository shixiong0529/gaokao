// api/generate.js
// Agent 编排核心：DeepSeek function calling 循环
// 工作流：用户输入 → LLM 决策调工具 → 搜索/计算 → 回传 LLM → 生成志愿方案 HTML

import { webSearch, resetCallCount, AUTHORITY_DOMAINS } from './tools/search.js';
import { generateReport } from './tools/report.js';
import { queryScoreToRank, queryBatchLines, getProvinceMode } from './tools/gaokaoData.js';

const API_KEY = process.env.DEEPSEEK_API_KEY;
const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const MAX_ROUNDS = parseInt(process.env.AGENT_MAX_ROUNDS || '6', 10);

// ===== 工具定义（OpenAI function calling schema） =====
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_college_info',
      description: '搜索院校基本信息：办学层次、特色专业、院校排名、办学地点。用于了解院校概况。',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '院校名称或关键词，如"武汉大学"' }
        },
        required: ['keyword']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_admission_score',
      description: '搜索院校近三年录取分数线和位次（一次查询即可获取多年数据，不要按年份分别调用）。必填参数：院校名、省份、首选科目。',
      parameters: {
        type: 'object',
        properties: {
          college: { type: 'string', description: '院校名称' },
          province: { type: 'string', description: '考生所在省份，如"湖北"' },
          firstChoice: { type: 'string', enum: ['物理', '历史'], description: '首选科目' }
        },
        required: ['college', 'province', 'firstChoice']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_recruitment_plan',
      description: '搜索院校当年招生计划：招生人数、专业组、选科要求。必填：院校名、省份。',
      parameters: {
        type: 'object',
        properties: {
          college: { type: 'string', description: '院校名称' },
          province: { type: 'string', description: '考生所在省份' },
          year: { type: 'number', description: '年份' }
        },
        required: ['college', 'province']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_rank_table',
      description: '搜索一分一段表，将高考分数换算为全省位次。当考生只提供了分数未提供位次时使用。必填：省份、分数、首选科目。',
      parameters: {
        type: 'object',
        properties: {
          province: { type: 'string', description: '省份' },
          score: { type: 'number', description: '高考分数' },
          firstChoice: { type: 'string', enum: ['物理', '历史'], description: '首选科目' },
          year: { type: 'number', description: '年份' }
        },
        required: ['province', 'score', 'firstChoice']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_subject_requirement',
      description: '搜索院校专业组的选科要求（必选物理/历史、再选科目要求）。新高考志愿填报的关键数据。',
      parameters: {
        type: 'object',
        properties: {
          college: { type: 'string', description: '院校名称' },
          province: { type: 'string', description: '考生所在省份' }
        },
        required: ['college', 'province']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_rank',
      description: '通过结构化数据接口查询一分一段表：分数→位次。优先使用此工具，比联网搜索更准确。支持按省份、年份、选科查询。未提供分数时返回该省该年一分一段概要。',
      parameters: {
        type: 'object',
        properties: {
          place: { type: 'string', description: '省份，如"湖南"' },
          year: { type: 'string', description: '年份，如"2025"；不传取最近已发布年份' },
          classify: { type: 'string', description: '选科：物理/历史/综合/文科/理科（3+1+2省份用物理或历史，3+3省份用综合，传统高考用文科/理科）' },
          score: { type: 'number', description: '分数；传了返回该分数同分人数和位次' }
        },
        required: ['place']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_batch_line',
      description: '通过结构化数据接口查询省份批次线：本科批/专科批/特控线等。优先使用此工具，比联网搜索更准确。返回各批次分数线和对应位次。',
      parameters: {
        type: 'object',
        properties: {
          place: { type: 'string', description: '省份，如"湖南"' },
          year: { type: 'string', description: '年份，如"2025"；不传取最近已发布年份' },
          student: { type: 'string', description: '选科：物理/历史/综合/文科/理科' }
        },
        required: ['place']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: '完成志愿方案生成。当已收集足够数据时调用，输出七板块结构化志愿方案（执行摘要/数据基础/志愿策略/院校详细分析/建议志愿表/风险提醒/来源声明）。',
      parameters: {
        type: 'object',
        properties: {
          executiveSummary: {
            type: 'object',
            description: '执行摘要',
            properties: {
              rows: {
                type: 'array',
                description: '考生信息键值表（含姓名/选科/分数/位次/批次线/超线分/位次优势/报考方向等）',
                items: {
                  type: 'object',
                  properties: {
                    k: { type: 'string', description: '项目名，如"高考总分"' },
                    v: { type: 'string', description: '内容，如"432分"' }
                  },
                  required: ['k', 'v']
                }
              },
              conclusion: { type: 'string', description: '核心结论，1段话总结分数定位和报考策略' }
            },
            required: ['rows', 'conclusion']
          },
          dataBasis: {
            type: 'object',
            description: '数据基础',
            properties: {
              yearLabel: { type: 'string', description: '数据年份说明，如"2026年批次线 + 2025年院校录取参考"' },
              batchLines: {
                type: 'array',
                description: '批次线表格（含当年和去年参考）',
                items: {
                  type: 'object',
                  properties: {
                    year: { type: 'number' },
                    region: { type: 'string' },
                    subject: { type: 'string', description: '物理/历史' },
                    batch: { type: 'string', description: '批次，如"本科批"' },
                    score: { type: 'number' },
                    rank: { type: 'number', description: '对应位次' }
                  },
                  required: ['year', 'region', 'subject', 'batch', 'score']
                }
              },
              schoolRefs: {
                type: 'array',
                description: '院校录取参考数据表',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: '院校名称' },
                    score: { type: 'string', description: '近年最低分，可带"约"字' },
                    rank: { type: 'string', description: '对应位次，可带"约"字' },
                    nature: { type: 'string', description: '办学性质：公办/民办' },
                    type: { type: 'string', description: '院校类型：综合类/理工类/师范类等' }
                  },
                  required: ['name', 'score']
                }
              },
              note: { type: 'string', description: '数据说明，如新高考批次线说明' },
              sourceNote: { type: 'string', description: '数据来源说明，附URL和年份口径' }
            }
          },
          scoreAnalysis: {
            type: 'object',
            description: '分数定位分析',
            properties: {
              paragraphs: {
                type: 'array',
                description: '分析段落（每段一句话），含高于/低于批次线、等效分数换算等',
                items: { type: 'string' }
              },
              equivalentScore: { type: 'string', description: '等效分数，如"换算到2025年约437分"' }
            }
          },
          tiers: {
            type: 'array',
            description: '冲稳保三层策略',
            items: {
              type: 'object',
              properties: {
                level: { type: 'string', enum: ['冲', '稳', '保'] },
                label: { type: 'string', description: '层级标题，如"冲一冲（录取概率较低，但有希望）"' },
                schools: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string', description: '院校名称' },
                      score: { type: 'string', description: '近年最低分' },
                      reason: { type: 'string', description: '冲/稳/保的理由' }
                    },
                    required: ['name', 'score', 'reason']
                  }
                }
              },
              required: ['level', 'schools']
            }
          },
          schoolDetails: {
            type: 'array',
            description: '推荐院校详细分析卡片',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: '院校名称' },
                category: { type: 'string', enum: ['冲', '稳', '保'], description: '冲稳保分类' },
                location: { type: 'string', description: '所在地，如"湖南岳阳"' },
                type: { type: 'string', description: '院校类型：综合类/理工类/师范类' },
                ownership: { type: 'string', description: '办学性质：公办普通本科等' },
                minScore: { type: 'string', description: '近年最低分，可带"约"' },
                rank: { type: 'string', description: '对应位次，可带"约"' },
                hasMaster: { type: 'string', description: '是否有硕士点：有/无' },
                strengths: { type: 'string', description: '优势学科' },
                analysis: { type: 'string', description: '冲刺/稳报/保底分析' }
              },
              required: ['name', 'category', 'analysis']
            }
          },
          volunteerTable: {
            type: 'array',
            description: '建议志愿表（最终推荐顺序）',
            items: {
              type: 'object',
              properties: {
                order: { type: 'number', description: '序号，从1开始' },
                category: { type: 'string', enum: ['冲', '稳', '保'] },
                college: { type: 'string', description: '院校名称' },
                city: { type: 'string', description: '所在地' },
                refScore: { type: 'string', description: '近年参考分' },
                transfer: { type: 'string', description: '建议服从调剂：✅ 是 / 视专业组 / 可不服从' }
              },
              required: ['order', 'category', 'college', 'transfer']
            }
          },
          riskChecklist: {
            type: 'object',
            description: '风险提醒与注意事项',
            properties: {
              timeliness: { type: 'array', description: '6.1 数据时效性', items: { type: 'string' } },
              subjectMatch: { type: 'array', description: '6.2 选科匹配', items: { type: 'string' } },
              transfer: { type: 'array', description: '6.3 专业调剂建议', items: { type: 'string' } },
              specialAdmission: { type: 'array', description: '6.4 特殊类型招生（专项计划/提前批）', items: { type: 'string' } },
              subjectScore: { type: 'array', description: '6.5 单科成绩关注', items: { type: 'string' } }
            }
          },
          sources: {
            type: 'array',
            description: '来源与时效声明（三件套：数据项+来源+年份+采集时间）',
            items: {
              type: 'object',
              properties: {
                item: { type: 'string', description: '数据项，如"2026年湖南物理类本科批分数线"' },
                source: { type: 'string', description: '来源名称，如"结构化数据接口（gaokao.search.qq.com）"或"高考100（gk100.com）整理"' },
                url: { type: 'string', description: '具体页面URL，可选' },
                year: { type: 'string', description: '采集年份' },
                collectedAt: { type: 'string', description: '采集时间，如"2026-06-27"' }
              },
              required: ['item', 'source', 'year']
            }
          }
        },
        required: ['executiveSummary', 'dataBasis', 'scoreAnalysis', 'tiers', 'schoolDetails', 'volunteerTable', 'riskChecklist', 'sources']
      }
    }
  }
];

// ===== System Prompt =====
const SYSTEM_PROMPT = `你是一名资深高考志愿填报顾问，服务对象是中国高考毕业生。

## 核心职责
根据考生分数、位次、省份、选科组合和偏好，生成**七板块结构化**的志愿填报参考方案。

## 工作方法（优先使用结构化接口）
1. **批次线/一分一段优先用结构化接口**：query_batch_line 查批次线，query_rank 查分数对应位次（比联网搜索更准确，数据来自 gaokao.search.qq.com）
2. 用 search_college_info 了解候选院校概况
3. 用 search_admission_score 查询院校近2-3年录取分数线和位次（按物理/历史类分别查）
4. 用 search_subject_requirement 查询院校专业组的选科要求，排除选科不匹配的院校
5. 用 search_recruitment_plan 查询当年招生计划
6. 数据充分后调用 finish 输出七板块方案

## 输出结构（finish 调用时必须填全七板块）
1. **executiveSummary**：执行摘要。rows 是考生信息键值表（姓名/选科/分数/位次/批次线/超线分/位次优势/报考方向），conclusion 是 1 段核心结论。
2. **dataBasis**：数据基础。batchLines 是当年+去年批次线表格；schoolRefs 是院校录取参考数据表（含办学性质/类型）；note 是新高考批次线说明；sourceNote 是数据来源说明（标注结构化接口或联网搜索）。
3. **scoreAnalysis**：分数定位分析。paragraphs 是分析段落（高于/低于批次线、等效分数换算）；equivalentScore 是等效分数。
4. **tiers**：冲稳保三层策略。每层含 schools 数组（院校名+近年最低分+冲稳保理由）。
5. **schoolDetails**：推荐院校详细分析卡片。每张含所在地/类型/办学性质/最低分/位次/硕士点/优势学科/分析。
6. **volunteerTable**：建议志愿表（最终推荐顺序）。含序号/冲稳保/院校/所在地/参考分/服从调剂建议。
7. **riskChecklist**：风险提醒。分 5 小节：数据时效性/选科匹配/专业调剂建议/特殊类型招生/单科成绩关注。
8. **sources**：来源与时效声明（三件套）。每条含数据项+来源+采集年份+采集时间。批次线/一分一段数据来自结构化接口的，来源标注"结构化数据接口（gaokao.search.qq.com）"；院校录取分来自联网搜索的，标注具体网页来源。

## 冲稳保配比（硬约束）
- 冲∶稳∶保 ≈ 3∶4∶3（6-9 所时：冲 2-3 所 / 稳 3-4 所 / 保 2-3 所）
- 候选数须 ≥ 本省可填志愿数 × 1.5，不够则提示用户放宽条件，不降数据标准
- 三层都要有院校，不允许只出"冲"或只出"保"

## 位次判定（k = R_school / R_user，位次越小越好）
- 冲：0.80 ≤ k < 0.95（院校位次高于我，有希望但不稳）
- 稳：0.95 ≤ k ≤ 1.08（与我相当或略优）
- 保：k > 1.08（明显低于我，兜底）
- 必须用专业组/专业位次，不能用院校最低位次

## 服从调剂建议（结合专业组干净度）
- 组内全为可接受专业 → 建议服从（"✅ 是"）
- 含 1-2 个中性专业 → "视专业组而定"
- 含明确拒绝专业 → "可不服从"或谨慎

## 不确定性标注
风险提醒必须包含：大小年波动 / 招生计划变动 / 位次≠分数 / 专业组位次vs院校位次的区别。
统一话术：「基于近 X 年数据的参考判断，非录取保证」。

## 年份口径（防用旧数据）
- 录取位次用近 2-3 届，必须包含最近一届已放榜数据
- 当前 2026 年：以 2025 为主、2024/2023 为辅，不得停在 2024
- 招生计划/代码/选科要求用当年；查不到标"待核实"

## 数据来源三件套（硬约束）
每个硬数据点（批次线/一分一段/院校录取分）必须标注三件套：
- item：数据项描述，如"2026年湖南物理类本科批分数线"
- source：来源名称。批次线/一分一段来自结构化接口的标注"结构化数据接口（gaokao.search.qq.com）"；院校录取分来自联网搜索的标注具体网页名和域名。
- url：具体页面URL（结构化接口可不填，联网搜索必须填）
- year：采集年份
- collectedAt：采集时间，格式 YYYY-MM-DD
禁止只写机构名（如"教育部官网"），必须给页面级 URL 或具体来源描述。

## 严格规则（违反即失败）
1. **严禁编造数据**：所有分数线、位次、招生计划必须来自搜索结果或结构化接口。未找到的，标注"数据待核实"。
2. **选科匹配是硬约束**：选科不符合的院校专业组，不可推荐。
3. **位次法优先**：录取判定用考生位次对比院校近 2-3 年录取位次，不用单纯分数比。
4. **来源必附**：每条数据尽量附 URL。批次线/一分一段用结构化接口时，来源明确标注接口名称。
5. **承诺词黑名单**：禁止出现"稳上""一定录取""保证录取""100%录取""必录""稳进"等承诺词。

## 工作效率（重要）
1. **批次线/位次先用结构化接口**，失败再回退联网搜索。
2. **search_admission_score 一次查近三年**，不要按年份分别调用。
3. **不要重复搜索**相同查询，已搜过的直接用之前结果。
4. **目标：6 轮内完成**。典型路径：① 结构化接口查批次线+位次 → ② 搜 5-6 所候选院校信息 → ③ 批量搜近三年分数线 → ④ 搜选科要求 → ⑤ 调 finish。
5. 每轮可并行调用多个工具，但避免单轮超过 6 个工具调用。`;

// ===== 工具执行器（带缓存，避免重复搜索） =====
const searchCache = new Map();
async function executeTool(name, args) {
  const cacheKey = name + ':' + JSON.stringify(args);
  if (searchCache.has(cacheKey)) {
    console.log(`[agent] cache hit: ${name}`);
    return searchCache.get(cacheKey);
  }
  let result;
  switch (name) {
    case 'search_college_info':
      result = await webSearch(`${args.keyword} 院校简介 办学层次 特色专业`, {
        maxResults: 6,
        includeDomains: [...AUTHORITY_DOMAINS.chsi, ...AUTHORITY_DOMAINS.eol, ...AUTHORITY_DOMAINS.college]
      });
      break;

    case 'search_admission_score':
      result = await webSearch(
        `${args.college} ${args.province} ${args.firstChoice}类 近三年 录取分数线 最低位次 2022 2023 2024`,
        { maxResults: 8, includeDomains: [...AUTHORITY_DOMAINS.eol, ...AUTHORITY_DOMAINS.chsi] }
      );
      break;

    case 'search_recruitment_plan':
      result = await webSearch(
        `${args.college} ${args.province} ${args.year || new Date().getFullYear()} 招生计划 招生人数 专业组`,
        { maxResults: 8, includeDomains: [...AUTHORITY_DOMAINS.chsi, ...AUTHORITY_DOMAINS.eol] }
      );
      break;

    case 'search_rank_table':
      result = await webSearch(
        `${args.province} ${args.year || new Date().getFullYear()} ${args.firstChoice}类 一分一段表 ${args.score}分 位次`,
        { maxResults: 8, includeDomains: [...AUTHORITY_DOMAINS.eol, ...AUTHORITY_DOMAINS.exam院] }
      );
      break;

    case 'search_subject_requirement':
      result = await webSearch(
        `${args.college} ${args.province} 选科要求 专业组 首选物理历史 再选科目`,
        { maxResults: 8, includeDomains: [...AUTHORITY_DOMAINS.eol, ...AUTHORITY_DOMAINS.chsi] }
      );
      break;

    case 'query_rank': {
      // 结构化数据接口：一分一段查询
      try {
        const mode = getProvinceMode(args.place, parseInt(args.year || String(new Date().getFullYear())));
        const classify = args.classify || mode.defaultSubject;
        const rankData = await queryScoreToRank({
          place: args.place,
          year: args.year,
          classify,
          score: args.score
        });
        result = {
          source: '结构化数据接口（gaokao.search.qq.com）',
          ...rankData,
          results: []
        };
      } catch (e) {
        result = { error: `一分一段查询失败: ${e.message}`, results: [] };
      }
      break;
    }

    case 'query_batch_line': {
      // 结构化数据接口：批次线查询
      try {
        const mode = getProvinceMode(args.place, parseInt(args.year || String(new Date().getFullYear())));
        const student = args.student || mode.defaultSubject;
        const batchData = await queryBatchLines({
          place: args.place,
          year: args.year,
          student
        });
        result = {
          source: '结构化数据接口（gaokao.search.qq.com）',
          ...batchData,
          results: []
        };
      } catch (e) {
        result = { error: `批次线查询失败: ${e.message}`, results: [] };
      }
      break;
    }

    case 'finish':
      result = { __finished: true, data: args };
      break;

    default:
      result = { error: `未知工具: ${name}` };
  }
  searchCache.set(cacheKey, result);
  return result;
}

// ===== 主编排函数 =====
export async function generatePlan(input) {
  if (!API_KEY) throw { status: 500, message: 'DEEPSEEK_API_KEY 未配置，请检查 .env 文件' };

  // 校验输入：分数必填，位次可选
  const { name, score, rank, province, firstChoice, reselect, preferences } = input;
  if (!province || !firstChoice) {
    throw { status: 400, message: '缺少必填字段：province, firstChoice' };
  }
  if (!score) {
    throw { status: 400, message: '请填写高考分数' };
  }

  resetCallCount();

  const allSources = [];

  const candidate = {
    name: name || '',
    province,
    subjectType: firstChoice === '物理' ? '物理类' : '历史类',
    score: score ? Number(score) : null,
    rank: rank ? Number(rank) : null,
    firstChoice,
    reselect: reselect || [],
    preferences: preferences || ''
  };

  // ===== 预取结构化数据（省 2 轮 agent 调用，直接注入 user message）=====
  const currentYear = new Date().getFullYear();
  const preflightData = { batchLines: [], rankInfo: null };
  const preflightSources = [];

  try {
    // 预取当年+去年批次线
    const mode = getProvinceMode(province, currentYear);
    const classify = mode.defaultSubject;
    for (const yr of [String(currentYear), String(currentYear - 1)]) {
      const bl = await queryBatchLines({ place: province, year: yr, student: classify });
      if (bl.batchLines?.length) {
        preflightData.batchLines.push(...bl.batchLines);
        preflightSources.push({
          item: `${yr}年${province}${classify}批次线`,
          source: '结构化数据接口（gaokao.search.qq.com）',
          url: '',
          year: yr,
          collectedAt: new Date().toISOString().slice(0, 10)
        });
      }
    }
    console.log(`[agent] preflight: 拿到 ${preflightData.batchLines.length} 条批次线`);
  } catch (e) {
    console.log(`[agent] preflight batch line failed: ${e.message}`);
  }

  // 预取位次（如果用户没填位次，用分数查；如果填了，也查一下同分人数）
  if (candidate.score) {
    try {
      const mode = getProvinceMode(province, currentYear);
      const rd = await queryScoreToRank({
        place: province,
        year: String(currentYear),
        classify: mode.defaultSubject,
        score: candidate.score
      });
      if (rd.rank) {
        preflightData.rankInfo = rd;
        if (!candidate.rank) candidate.rank = rd.rank; // 自动补位次
        preflightSources.push({
          item: `${currentYear}年${province}${mode.defaultSubject}${candidate.score}分一分一段`,
          source: '结构化数据接口（gaokao.search.qq.com）',
          url: '',
          year: String(currentYear),
          collectedAt: new Date().toISOString().slice(0, 10)
        });
        console.log(`[agent] preflight: 位次 ${rd.rank}（同分${rd.sameCount}人）`);
      }
    } catch (e) {
      console.log(`[agent] preflight rank failed: ${e.message}`);
    }
  }

  // 预取数据注入 allSources
  preflightSources.forEach(s => allSources.push(s));

  // 构造预取数据摘要，注入 user message
  const batchLineSummary = preflightData.batchLines.length
    ? preflightData.batchLines.map(b => `${b.year}年${b.region}${b.category}${b.batch}：${b.score}分（位次${b.rank?.toLocaleString()}）`).join('\n')
    : '未取到，请用 query_batch_line 查询';
  const rankSummary = preflightData.rankInfo
    ? `位次${preflightData.rankInfo.rank.toLocaleString()}（同分${preflightData.rankInfo.sameCount}人）`
    : (candidate.rank ? `约${candidate.rank.toLocaleString()}` : '未取到，请用 query_rank 查询');

  const scoreLine = score ? `- 高考分数：${score}` : '- 高考分数：未提供';
  const rankLine = `- 全省位次：${rankSummary}`;

  const userMessage = `考生信息：
- 姓名：${name || '未提供'}
- 省份：${province}
${scoreLine}
${rankLine}
- 首选科目：${firstChoice}
- 再选科目：${(reselect || []).join('、')}
- 院校/专业偏好：${preferences || '无特殊偏好'}

## 已预取的结构化数据（直接使用，无需再用 query_batch_line / query_rank 查询）
### 批次线
${batchLineSummary}

### 一分一段
${rankSummary}

请根据以上信息，**直接进入院校录取分搜索阶段**（用 search_admission_score 查近2-3年录取分数线），生成冲稳保分层的志愿填报参考方案（6-9 所院校）。

输出必须填全七板块（finish schema 已定义）：
1. executiveSummary - 执行摘要（考生信息键值表 + 核心结论）
2. dataBasis - 数据基础（批次线用上面预取的数据，院校录取参考表用搜索结果）
3. scoreAnalysis - 分数定位分析（高于/低于批次线、等效分数换算）
4. tiers - 冲稳保三层策略（每层含院校+近年最低分+理由）
5. schoolDetails - 推荐院校详细分析卡片（含所在地/类型/硕士点/优势学科/分析）
6. volunteerTable - 建议志愿表（序号/冲稳保/院校/所在地/参考分/服从调剂建议）
7. riskChecklist - 风险提醒（5 小节：时效性/选科/调剂/特殊招生/单科成绩）
8. sources - 来源三件套（数据项+来源+采集年份+采集时间，每条硬数据都要标）

## 工具使用纪律（必须遵守）
1. **批次线/位次已预取，不要再调 query_batch_line / query_rank**，直接用上面提供的数据。
2. **第一轮就开始搜院校录取分**（search_admission_score），一轮搜 4-6 所。
3. **search_admission_score 一次查近三年**，不要按年份分别调用。
4. **不要重复搜索**相同查询，已搜过的直接用之前结果。
5. **目标 5 轮内完成**：① 搜 5-6 所院校录取分 → ② 搜选科要求/院校信息 → ③ 调 finish。
6. **finish 的 JSON 参数可能较长**，确保输出完整 JSON，不要中途截断。
7. **riskChecklist 五个小节都要填**（timeliness/subjectMatch/transfer/specialAdmission/subjectScore），每节至少 2 条。`;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage }
  ];

  let finalData = null;
  let rounds = 0;

  while (rounds < MAX_ROUNDS) {
    rounds++;
    console.log(`[agent] round ${rounds}, search calls: ${getCallCountForLog()}`);

    let resp;
    try {
      // 调用 DeepSeek（带 120 秒超时）
      const dsController = new AbortController();
      const dsTimeout = setTimeout(() => dsController.abort(), 120000);
      resp = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          tools: TOOLS,
          tool_choice: 'auto',
          temperature: 0.3,
          max_tokens: 16000
        }),
        signal: dsController.signal
      });
      clearTimeout(dsTimeout);
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') {
        console.error(`[agent] round ${rounds} DeepSeek 请求超时（120秒）`);
        // 超时：尝试返回已收集的部分数据
        if (finalData) break; // 已有 finish 数据，直接返回
        throw { status: 504, message: 'AI 处理超时（120秒），七板块数据量较大。建议减少"院校偏好"描述，让查询更聚焦；或稍后重试。' };
      }
      throw fetchErr;
    }

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('[deepseek] error:', resp.status, errText);
      throw { status: 502, message: `DeepSeek API 错误 ${resp.status}: ${errText.slice(0, 200)}` };
    }

    const data = await resp.json();
    const msg = data.choices[0].message;
    messages.push(msg);

    // 无 tool_calls → 结束
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      // LLM 直接返回文本（未调 finish），构造空骨架
      finalData = {
        executiveSummary: { rows: [], conclusion: msg.content || '方案已生成' },
        rawText: msg.content
      };
      break;
    }

    // 执行工具
    let shouldFinish = false;
    for (const tc of msg.tool_calls) {
      let args;
      try {
        args = JSON.parse(tc.function.arguments || '{}');
      } catch (e) {
        console.log(`[agent] JSON parse failed for tool ${tc.function.name}, attempting repair...`);
        args = repairTruncatedJSON(tc.function.arguments || '{}', tc.function.name);
        if (!args) {
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({ error: '参数 JSON 解析失败，请重新调用并输出完整的 JSON。建议分多次输出：先输出 executiveSummary/dataBasis/scoreAnalysis，再输出 tiers/schoolDetails/volunteerTable/riskChecklist/sources。' })
          });
          continue;
        }
      }
      console.log(`[agent] tool: ${tc.function.name}`, JSON.stringify(args).slice(0, 200));
      if (tc.function.name === 'finish') {
        console.log(`[agent] finish args keys:`, Object.keys(args));
        console.log(`[agent] finish executiveSummary type:`, typeof args.executiveSummary, Array.isArray(args.executiveSummary) ? 'array' : '');
        // LLM 有时把整个对象当字符串传，尝试反序列化
        for (const key of ['executiveSummary', 'dataBasis', 'scoreAnalysis', 'riskChecklist']) {
          if (typeof args[key] === 'string') {
            try {
              args[key] = JSON.parse(args[key]);
              console.log(`[agent] finish: ${key} was string, parsed to object`);
            } catch (e) { /* 保持字符串，normalizeFinishData 会兜底 */ }
          }
        }
        for (const key of ['tiers', 'schoolDetails', 'volunteerTable', 'sources']) {
          if (typeof args[key] === 'string') {
            try {
              args[key] = JSON.parse(args[key]);
              console.log(`[agent] finish: ${key} was string, parsed to array`);
            } catch (e) { /* 保持 */ }
          }
        }
      }
      const result = await executeTool(tc.function.name, args);

      if (result.__finished) {
        // 容错：确保七板块字段类型正确
        finalData = normalizeFinishData(result.data);
        shouldFinish = true;
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify({ status: 'finished' })
        });
      } else {
        // 收集来源（兜底三件套，关联到具体工具调用）
        const toolLabel = labelForToolCall(tc.function.name, args);
        const collectedAt = new Date().toISOString().slice(0, 10);

        // 结构化接口（query_rank / query_batch_line）的来源单独处理
        if (tc.function.name === 'query_rank' && result.rank) {
          if (!allSources.find(s => s.item === toolLabel)) {
            allSources.push({
              item: toolLabel,
              source: result.source || '结构化数据接口',
              url: '',
              year: result.year || String(new Date().getFullYear()),
              collectedAt
            });
          }
        } else if (tc.function.name === 'query_batch_line' && result.batchLines?.length) {
          if (!allSources.find(s => s.item === toolLabel)) {
            allSources.push({
              item: toolLabel,
              source: result.source || '结构化数据接口',
              url: '',
              year: result.year || String(new Date().getFullYear()),
              collectedAt
            });
          }
        } else if (result.results) {
          // 联网搜索结果的来源收集
          result.results.forEach(r => {
            if (r.url && !allSources.find(s => s.url === r.url)) {
              allSources.push({
                item: toolLabel,
                source: r.title || r.url,
                url: r.url,
                year: String(new Date().getFullYear()),
                collectedAt
              });
            }
          });
        }
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result).slice(0, 6000)
        });
      }
    }

    if (shouldFinish) break;
  }

  if (!finalData) {
    throw { status: 500, message: `Agent 在 ${MAX_ROUNDS} 轮内未完成，可能搜索结果不足` };
  }

  // 来源兜底：若 LLM 在 finish.sources 里给了三件套，优先用；否则用 allSources 兜底
  const finalSources = (finalData.sources && finalData.sources.length > 0)
    ? finalData.sources
    : allSources.slice(0, 15);

  // 生成 HTML 报告（七板块直传）
  const html = generateReport({
    candidate,
    executiveSummary: finalData.executiveSummary || {},
    dataBasis: finalData.dataBasis || {},
    scoreAnalysis: finalData.scoreAnalysis || {},
    tiers: finalData.tiers || [],
    schoolDetails: finalData.schoolDetails || [],
    volunteerTable: finalData.volunteerTable || [],
    riskChecklist: finalData.riskChecklist || {},
    sources: finalSources,
    provinceAuthority: PROVINCE_AUTHORITY[candidate.province] || null
  });

  // 同步生成 docx（用于下载）
  let docxBase64 = null;
  try {
    const HTMLtoDOCX = (await import('html-to-docx')).default;
    // docx 需要完整 HTML 文档（含 html/body 包裹）
    const fullHtml = html.startsWith('<!DOCTYPE') ? html : `<!DOCTYPE html><html><body>${html}</body></html>`;
    const buffer = await HTMLtoDOCX(fullHtml, null, { table: { row: { cantSplit: true } } });
    docxBase64 = buffer.toString('base64');
  } catch (e) {
    console.error('[generate] docx 转换失败:', e.message);
  }

  return {
    html,
    docxBase64,
    executiveSummary: finalData.executiveSummary,
    dataBasis: finalData.dataBasis,
    scoreAnalysis: finalData.scoreAnalysis,
    tiers: finalData.tiers,
    schoolDetails: finalData.schoolDetails,
    volunteerTable: finalData.volunteerTable,
    riskChecklist: finalData.riskChecklist,
    sources: finalSources,
    meta: {
      rounds,
      searchCalls: getCallCountForLog(),
      model: MODEL
    }
  };
}

// 把工具调用翻译成"数据项"标签，用于来源三件套兜底
function labelForToolCall(name, args) {
  switch (name) {
    case 'query_rank':
      return `${args.place} ${args.classify || ''} ${args.score ? args.score + '分' : ''} 一分一段位次`.trim();
    case 'query_batch_line':
      return `${args.place} ${args.student || ''} 批次线`.trim();
    case 'search_admission_score':
      return `${args.college} ${args.province} ${args.firstChoice}类 近年录取分数线`;
    case 'search_recruitment_plan':
      return `${args.college} ${args.province} ${args.year || new Date().getFullYear()} 招生计划`;
    case 'search_rank_table':
      return `${args.province} ${args.firstChoice}类 ${args.score}分 一分一段表`;
    case 'search_subject_requirement':
      return `${args.college} ${args.province} 选科要求`;
    case 'search_college_info':
      return `${args.keyword} 院校信息`;
    default:
      return name;
  }
}

// 省份 → 教育考试院映射（用于报告"建议志愿表"提示语）
const PROVINCE_AUTHORITY = {
  '湖北': { name: '湖北省教育考试院', url: 'http://www.hbea.cn/' },
  '湖南': { name: '湖南省教育考试院', url: 'https://www.hneao.edu.cn/' },
  '广东': { name: '广东省教育考试院', url: 'https://eea.gd.gov.cn/' },
  '江苏': { name: '江苏省教育考试院', url: 'https://www.jseea.cn/' },
  '浙江': { name: '浙江省教育考试院', url: 'https://www.zjzs.net/' },
  '山东': { name: '山东省教育招生考试院', url: 'https://www.sdzk.cn/' },
  '河南': { name: '河南省招生办公室', url: 'https://www.heao.gov.cn/' },
  '四川': { name: '四川省教育考试院', url: 'https://www.sceea.cn/' },
  '河北': { name: '河北省教育考试院', url: 'http://www.hebeea.edu.cn/' },
  '福建': { name: '福建省教育考试院', url: 'https://www.eeafj.cn/' },
  '安徽': { name: '安徽省教育招生考试院', url: 'https://www.ahzsks.cn/' },
  '江西': { name: '江西省教育考试院', url: 'http://www.jxeea.cn/' },
  '重庆': { name: '重庆市教育考试院', url: 'https://www.cqksy.cn/' },
  '辽宁': { name: '辽宁省高中等教育招生考试委员会办公室', url: 'https://www.lnzsks.com/' },
  '北京': { name: '北京教育考试院', url: 'https://www.bjeea.cn/' },
  '上海': { name: '上海市教育考试院', url: 'https://www.shmeea.edu.cn/' },
  '天津': { name: '天津市教育招生考试院', url: 'http://www.zhaokao.net/' }
};

function getCallCountForLog() {
  // 从 search.js 读取（简单实现）
  return 'N';
}

/**
 * 修复被 max_tokens 截断的 JSON 参数
 * 策略：1.先统计未闭合的 { [ " 补全  2.仍失败则尝试提取已完整的顶层字段
 * @param {string} raw - 原始 JSON 字符串
 * @param {string} toolName - 工具名（用于日志）
 * @returns {Object|null} 解析成功返回对象，失败返回 null
 */
function repairTruncatedJSON(raw, toolName) {
  if (!raw || raw === '{}') return {};

  // 策略1：补全未闭合的括号和引号
  try {
    // 找到最后一个完整的键值对结束位置（", " 或 ",}" 模式）
    let repaired = raw.trimEnd();

    // 统计未闭合的引号（简化处理：成对消除）
    const quoteCount = (repaired.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      repaired = repaired + '"';
    }

    // 统计未闭合的 { 和 [
    const opens = (repaired.match(/[{[]/g) || []).length;
    const closes = (repaired.match(/[}\]]/g) || []).length;
    const unclosed = opens - closes;

    if (unclosed > 0) {
      // 如果最后一个非空白字符是冒号或逗号，先补一个空值
      const lastChar = repaired.trimEnd().slice(-1);
      if (lastChar === ':' || lastChar === ',') {
        repaired = repaired + '""';
      }
      // 补全未闭合的括号（先 ] 后 }，交替补）
      for (let i = 0; i < unclosed; i++) {
        // 简化：交替补 ] 和 }
        // 实际上需要根据上下文判断，但这里用启发式：先补 ] 再补 }
        repaired = repaired + ']'.repeat(Math.ceil(unclosed / 2)) + '}'.repeat(Math.floor(unclosed / 2) + (unclosed % 2));
        break;
      }
      // 上面循环逻辑有误，重写
      repaired = raw.trimEnd();
      if (quoteCount % 2 !== 0) repaired = repaired + '"';
      const lastChar2 = repaired.trimEnd().slice(-1);
      if (lastChar2 === ':' || lastChar2 === ',') repaired = repaired + '""';

      // 重新统计并补全
      const o2 = (repaired.match(/[{[]/g) || []).length;
      const c2 = (repaired.match(/[}\]]/g) || []).length;
      const need = o2 - c2;
      // 启发式：检查每个未闭合的是 { 还是 [
      // 简化：用栈模拟
      const stack = [];
      let inStr = false;
      let prev = '';
      for (const ch of repaired) {
        if (ch === '"' && prev !== '\\') inStr = !inStr;
        if (!inStr) {
          if (ch === '{' || ch === '[') stack.push(ch);
          if (ch === '}' || ch === ']') stack.pop();
        }
        prev = ch;
      }
      // stack 里剩下的是未闭合的，逆序补
      const closers = stack.reverse().map(c => c === '{' ? '}' : ']').join('');
      repaired = repaired + closers;

      try {
        const parsed = JSON.parse(repaired);
        console.log(`[agent] JSON repair v2 succeeded (stack-based, added ${closers.length} closers)`);
        return parsed;
      } catch (e3) {
        // 继续策略2
      }
    }
  } catch (outerErr) {
    // 忽略，继续策略2
  }

  // 策略2：提取已完整的顶层字段（适用于 finish 被截断的情况）
  // 尝试用正则提取 "fieldName": 后面的值（字符串、数组、对象）
  try {
    const extracted = extractCompleteFields(raw);
    if (extracted && Object.keys(extracted).length > 0) {
      console.log(`[agent] JSON repair: extracted ${Object.keys(extracted).length} complete fields from truncated JSON`);
      return extracted;
    }
  } catch (e2) {
    // 忽略
  }

  console.log(`[agent] JSON repair failed for ${toolName}`);
  return null;
}

/**
 * 从截断的 JSON 中提取已完整的顶层字段
 * 针对 finish 工具的七板块结构优化
 */
function extractCompleteFields(raw) {
  const result = {};
  const fields = ['executiveSummary', 'dataBasis', 'scoreAnalysis', 'tiers', 'schoolDetails', 'volunteerTable', 'riskChecklist', 'sources'];

  for (const field of fields) {
    // 查找 "field": 的位置
    const pattern = `"${field}"\\s*:`;
    const match = raw.match(new RegExp(pattern));
    if (!match) continue;

    const valueStart = raw.indexOf(match[0]) + match[0].length;
    // 跳过空白
    let i = valueStart;
    while (i < raw.length && /\s/.test(raw[i])) i++;
    if (i >= raw.length) continue;

    const firstChar = raw[i];

    if (firstChar === '{') {
      // 对象：找匹配的 }
      const objStr = extractBalanced(raw, i, '{', '}');
      if (objStr) {
        try { result[field] = JSON.parse(objStr); } catch (e) { /* skip */ }
      }
    } else if (firstChar === '[') {
      // 数组：找匹配的 ]
      const arrStr = extractBalanced(raw, i, '[', ']');
      if (arrStr) {
        try { result[field] = JSON.parse(arrStr); } catch (e) { /* skip */ }
      }
    } else if (firstChar === '"') {
      // 字符串：找结束引号（考虑转义）
      let end = i + 1;
      while (end < raw.length) {
        if (raw[end] === '"' && raw[end - 1] !== '\\') break;
        end++;
      }
      if (end < raw.length) {
        try { result[field] = JSON.parse(raw.slice(i, end + 1)); } catch (e) { /* skip */ }
      }
    }
  }

  return result;
}

/**
 * 从 start 位置开始，提取平衡的括号内容
 */
function extractBalanced(str, start, openChar, closeChar) {
  let depth = 0;
  let inStr = false;
  let prev = '';
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
    if (ch === '"' && prev !== '\\') inStr = !inStr;
    if (!inStr) {
      if (ch === openChar) depth++;
      if (ch === closeChar) {
        depth--;
        if (depth === 0) return str.slice(start, i + 1);
      }
    }
    prev = ch;
  }
  return null; // 未找到匹配的闭合
}

/**
 * 容错处理 finish 返回的数据：确保七板块字段类型正确
 * 防止 LLM 输出类型不符（如 tiers 是字符串而非数组）导致 report.js 崩溃
 */
function normalizeFinishData(data) {
  if (!data || typeof data !== 'object') return {};

  const ensureArray = (v) => Array.isArray(v) ? v : [];
  const ensureObject = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};

  return {
    executiveSummary: ensureObject(data.executiveSummary),
    dataBasis: ensureObject(data.dataBasis),
    scoreAnalysis: ensureObject(data.scoreAnalysis),
    tiers: ensureArray(data.tiers),
    schoolDetails: ensureArray(data.schoolDetails),
    volunteerTable: ensureArray(data.volunteerTable),
    riskChecklist: ensureObject(data.riskChecklist),
    sources: ensureArray(data.sources)
  };
}
