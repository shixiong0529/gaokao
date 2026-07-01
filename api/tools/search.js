// api/tools/search.js
// 搜索工具封装：开发期用 DuckDuckGo HTML 抓取（无 Key），上线切 Tavily
// 接口统一返回 { results: [{ title, url, snippet }] }

const PROVIDER = process.env.SEARCH_PROVIDER || 'ddg';
const MAX_CALLS = parseInt(process.env.SEARCH_MAX_CALLS || '15', 10);
// 单次搜索超时（秒级），防止某个慢/被限流的搜索拖垮整个请求
const SEARCH_TIMEOUT_MS = parseInt(process.env.SEARCH_TIMEOUT_MS || '10000', 10);

// 调用计数器（单次请求内）
let callCount = 0;
export function resetCallCount() { callCount = 0; }
export function getCallCount() { return callCount; }

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
  callCount++;
  if (callCount > MAX_CALLS) {
    return { results: [], truncated: true, reason: '达到单次请求搜索次数上限' };
  }

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
  callCount++;
  if (callCount > MAX_CALLS) {
    return { results: [], truncated: true, reason: '达到单次请求搜索次数上限' };
  }
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
  // Bing 新结构：h2 > a
  const linkRegex = /<h2><a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/g;
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
  callCount++;
  if (callCount > MAX_CALLS) {
    return { results: [], truncated: true, reason: '达到单次请求搜索次数上限' };
  }
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
  if (!resp.ok) throw new Error(`Tavily HTTP ${resp.status}`);
  const data = await resp.json();
  return {
    results: (data.results || []).map(r => ({ title: r.title, url: r.url, snippet: r.content })),
    truncated: false
  };
}

// ===== 统一入口 =====
// 任何失败（超时/网络/限流）都不抛出，返回空结果并附 error，避免单个搜索拖垮整个请求
export async function webSearch(query, options = {}) {
  try {
    if (PROVIDER === 'tavily') return await searchTavily(query, options);
    if (PROVIDER === 'bing') return await searchBing(query, options);
    return await searchDDG(query, options);
  } catch (err) {
    const reason = err.name === 'AbortError'
      ? `搜索超时（${Math.round(SEARCH_TIMEOUT_MS / 1000)}秒）`
      : (err.message || '搜索失败');
    console.error(`[search] "${String(query).slice(0, 40)}" 失败: ${reason}`);
    return { results: [], error: reason };
  }
}

// 权威站点白名单（高考数据可信源）
export const AUTHORITY_DOMAINS = {
  chsi: ['gaokao.chsi.com.cn'],
  eol: ['eol.cn', 'gkcx.eol.cn'],
  exam院: ['eea.gd.gov.cn', 'jyt.hubei.gov.cn', 'jseea.cn'],
  college: ['edu.cn']
};
