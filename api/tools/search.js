// api/tools/search.js
// 搜索工具封装：开发期用 DuckDuckGo HTML 抓取（无 Key），上线切 Tavily
// 接口统一返回 { results: [{ title, url, snippet }] }

const PROVIDER = process.env.SEARCH_PROVIDER || 'ddg';
const MAX_CALLS = parseInt(process.env.SEARCH_MAX_CALLS || '15', 10);
// 单次搜索超时（秒级），防止某个慢/被限流的搜索拖垮整个请求
const SEARCH_TIMEOUT_MS = parseInt(process.env.SEARCH_TIMEOUT_MS || '10000', 10);

// 请求级搜索上下文：计数器挂在每次 /api/generate 自己的 ctx 上。
// 不能用模块级变量——并发请求会互相重置/消耗对方的搜索限额。
export function createSearchContext() {
  return { calls: 0 };
}

// 兜底 ctx：调用方没传 ctx 时退化为进程级计数（仅防失控，不保证隔离）
const fallbackCtx = createSearchContext();

function consumeCall(ctx) {
  const c = ctx || fallbackCtx;
  c.calls++;
  return c.calls <= MAX_CALLS;
}

// 带超时的 fetch：到点即 abort，避免无限等待
async function fetchWithTimeout(url, opts = {}, timeoutMs = SEARCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ===== DuckDuckGo HTML 抓取（开发期，免费无 Key） =====
async function searchDDG(query, options = {}) {
  const { includeDomains = [], maxResults = 8 } = options;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Accept': 'text/html,application/xhtml+xml'
  };

  const resp = await fetchWithTimeout(url, { headers });
  if (!resp.ok) {
    throw new Error(`DuckDuckGo search HTTP ${resp.status}`);
  }
  const html = await resp.text();

  const results = [];

  // DDG HTML 版结构：
  // <a class="result__a" href="//duckduckgo.com/l/?uddg=<encoded url>">title</a>
  // <a class="result__snippet">snippet</a>
  const itemRegex = /<div class="result[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g;
  let match;
  while ((match = itemRegex.exec(html)) !== null && results.length < maxResults) {
    const block = match[1];

    // 提取链接（DDG 用跳转链接，需解析 uddg 参数）
    const linkMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    let linkUrl = linkMatch[1];
    // 解析 DDG 跳转：//duckduckgo.com/l/?uddg=<urlencoded>
    const uddgMatch = linkUrl.match(/uddg=([^&]+)/);
    if (uddgMatch) {
      linkUrl = decodeURIComponent(uddgMatch[1]);
    } else if (linkUrl.startsWith('//')) {
      linkUrl = 'https:' + linkUrl;
    }

    const title = linkMatch[2].replace(/<[^>]+>/g, '').trim();

    // 提取摘要
    const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
    const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    // 域名过滤
    if (includeDomains.length > 0) {
      const matched = includeDomains.some(d => linkUrl.includes(d));
      if (!matched) continue;
    }

    if (title && linkUrl && !linkUrl.includes('duckduckgo.com')) {
      results.push({ title, url: linkUrl, snippet });
    }
  }

  return { results, truncated: false };
}

// ===== Bing 备选（HTML 结构不稳定，留作备选） =====
async function searchBing(query, options = {}) {
  const { includeDomains = [], maxResults = 8 } = options;
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults + 4}&setlang=zh-CN`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9'
  };
  const resp = await fetchWithTimeout(url, { headers });
  if (!resp.ok) throw new Error(`Bing HTTP ${resp.status}`);
  const html = await resp.text();
  const results = [];
  // Bing 结构多变：h2 可能带 class 等属性，放宽匹配
  const linkRegex = /<h2[^>]*><a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/g;
  let m;
  while ((m = linkRegex.exec(html)) !== null && results.length < maxResults) {
    const linkUrl = m[1];
    const title = m[2].replace(/<[^>]+>/g, '').trim();
    if (includeDomains.length > 0 && !includeDomains.some(d => linkUrl.includes(d))) continue;
    if (title && linkUrl) results.push({ title, url: linkUrl, snippet: '' });
  }
  return { results, truncated: false };
}

// ===== Tavily（上线期，需 Key） =====
async function searchTavily(query, options = {}) {
  const { includeDomains = [], maxResults = 8 } = options;
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error('TAVILY_API_KEY 未配置');
  const resp = await fetchWithTimeout('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      include_domains: includeDomains,
      max_results: maxResults
    })
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Tavily HTTP ${resp.status}${/usage limit/i.test(body) ? '（额度已用完）' : ''}`);
  }
  const data = await resp.json();
  // Tavily 额度耗尽时可能返回 200 + detail.error
  if (data.detail?.error) throw new Error(`Tavily: ${data.detail.error}`);
  return {
    results: (data.results || []).map(r => ({ title: r.title, url: r.url, snippet: r.content })),
    truncated: false
  };
}

// ===== 渠道降级链 =====
// 主渠道失败（额度耗尽/被限流/网络不通）自动切换其他渠道，故障渠道冷却 5 分钟
const PROVIDER_FNS = { tavily: searchTavily, bing: searchBing, ddg: searchDDG };
const PROVIDER_COOLDOWN_MS = 5 * 60 * 1000;
const providerCooldown = new Map(); // provider → 冷却截止时间戳

function providerChain() {
  const primary = PROVIDER_FNS[PROVIDER] ? PROVIDER : 'ddg';
  return [primary, ...Object.keys(PROVIDER_FNS).filter(p => p !== primary)];
}

function isCoolingDown(provider) {
  const until = providerCooldown.get(provider);
  return until != null && Date.now() < until;
}

// ===== 统一入口 =====
// 任何失败（超时/网络/限流）都不抛出，返回空结果并附 error，避免单个搜索拖垮整个请求
export async function webSearch(query, options = {}) {
  if (!consumeCall(options.ctx)) {
    return { results: [], truncated: true, reason: '达到单次请求搜索次数上限' };
  }

  let lastError = null;
  for (const provider of providerChain()) {
    if (isCoolingDown(provider)) continue;
    try {
      const res = await PROVIDER_FNS[provider](query, options);
      if (res.results.length > 0) return res;
      // 域名白名单可能把结果全过滤掉了：放宽限制在本渠道重试一次
      if (options.includeDomains?.length) {
        const relaxed = await PROVIDER_FNS[provider](query, { ...options, includeDomains: [] });
        if (relaxed.results.length > 0) return relaxed;
      }
      // 本渠道正常但确实搜不到，换下一渠道再试
    } catch (err) {
      lastError = err.name === 'AbortError'
        ? `搜索超时（${Math.round(SEARCH_TIMEOUT_MS / 1000)}秒）`
        : (err.message || '搜索失败');
      providerCooldown.set(provider, Date.now() + PROVIDER_COOLDOWN_MS);
      console.error(`[search] ${provider} "${String(query).slice(0, 40)}" 失败并冷却5分钟: ${lastError}`);
    }
  }
  return { results: [], error: lastError || '各搜索渠道均未返回结果' };
}

// 权威站点白名单（高考数据可信源）
export const AUTHORITY_DOMAINS = {
  chsi: ['gaokao.chsi.com.cn'],
  eol: ['eol.cn', 'gkcx.eol.cn'],
  exam院: ['eea.gd.gov.cn', 'jyt.hubei.gov.cn', 'jseea.cn'],
  college: ['edu.cn']
};
