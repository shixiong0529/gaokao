# 高考志愿填报方案生成器 · 设计文档

> 创建日期：2026-07-01
> 状态：方案设计（待确认后进入实现）

---

## 1. 背景与目标

为高考毕业生提供"输入分数/位次/偏好 → 输出可下载 HTML 志愿方案"的 web 应用。核心难点：志愿填报依赖**当年**招生计划、分数线、院校信息，纯 LLM API 无法联网，知识可能过时。

**目标**：用"后端编排 Agent + 联网搜索 + LLM"实现信息实时性，最终交付符合浅色主题规范的 HTML 志愿方案。

---

## 2. 关键技术结论（回答原始问题）

| 问题 | 结论 |
|---|---|
| 能否在 web 里直接调用 workbuddy/codex agent？ | **不能直接调用**。WorkBuddy 是桌面客户端，无公开 web API；Codex CLI 是本地工具。前端直调还会暴露 Key 并触发 CORS。 |
| "web 应用内嵌搜索 + LLM API" 可行吗？ | **完全可行，是主流方案**（Agentic Search / RAG + Web Search）。 |
| 正确转换 | "调用 agent" → "在自有后端用云 LLM 的 function calling + 搜索工具，编排 agent 循环"。LLM 的 tool use 能力就是 agent 的本质。 |

---

## 3. 技术架构

三层结构（详见架构图）：

```
浏览器（前端）
   ↕  HTTP
Serverless 后端 · Agent 编排器
   ├─ LLM 决策中枢（DeepSeek function calling 循环）
   └─ 工具集（LLM 自主调用）
       ↕                ↕
   Tavily 搜索 API    DeepSeek LLM API
```

**数据流**：用户输入 → 后端 → ① LLM 决策调搜索工具 → ② Tavily 抓当年数据 → ③ 数据回传 LLM → ④ LLM 综合生成志愿表 → ⑤ 生成 HTML 报告 → 返回前端。

---

## 4. 技术选型

> 更新（2026-07-01）：用户已有阿里云 Ubuntu ECS + 未备案国内域名，部署平台从 Vercel/腾讯云函数改为自有 ECS，长期最稳。

| 层 | 选型 | 理由 |
|---|---|---|
| 前端 | 原生 HTML + 轻量 JS（Fetch API） | "HTML 交付"偏好，无需重框架；表单简单 |
| 后端 | **阿里云 ECS + Node.js 22 + Express** | 自有服务器，自主可控；国内节点访问快、调 DeepSeek 延迟低；无 Serverless 冷启动 |
| 进程守护 | PM2 | Node 服务常驻、崩溃自动重启、日志管理 |
| 反向代理 | Nginx | 端口转发、HTTPS 终结、静态资源加速 |
| 域名/备案 | 已有国内域名 + 阿里云 ICP 备案（开发期用 IP 直连） | 备案约 7-20 天；备案前用 `IP:3000` 自测 |
| HTTPS | Let's Encrypt（certbot） | 免费证书，备案完成后启用 |
| 搜索 | **Tavily API** | 专为 AI 优化，返回干净文本；免费 1000 次/月；支持站点限定 |
| LLM | **DeepSeek（deepseek-chat）** | 性价比最高（约 OpenAI 1/10）；function calling 稳定；中文强；国内直连 |
| 备选 LLM | 通义千问 / 智谱 GLM-4 | 当 DeepSeek 不可用时的国产备选 |

### 4.1 部署三阶段

| 阶段 | 访问方式 | 域名 | 备注 |
|---|---|---|---|
| 开发期（现在） | `http://ECS公网IP:3000` | 不绑定 | 无需备案，立即可用；同步提交备案 |
| 备案审核中 | `IP:3000` 自测 | 解析到 ECS 但不绑 80/443 | 阿里云校验域名解析需指向该 ECS |
| 备案完成 | `https://域名` | Nginx 反代 + Let's Encrypt | 正式上线，国内毫秒级访问 |

---

## 5. Agent 工作流程（function calling 循环）

```
1. 前端 POST /api/generate { score, rank, province, subjectType, preferences }
2. 后端构造 system prompt（角色+工具定义+约束）+ user message
3. 调用 DeepSeek（带 tools 定义）
4. ┌─ DeepSeek 返回 tool_calls（如 search_score）
   ├─ 后端执行对应工具 → 调 Tavily
   ├─ tool 结果作为 tool message 回传 DeepSeek
   └─ 回到步骤 4，直到 DeepSeek 返回最终 content（志愿方案）
5. 后端调用 gen_report 工具 / 直接渲染 → 生成 HTML
6. 返回 { html, sources, plan } 给前端
```

**循环上限**：设 8 轮，防失控。每轮搜索结果带来源 URL，汇总进 sources。

---

## 6. 工具集定义（function calling schema）

| 工具 | 参数 | 作用 |
|---|---|---|
| `search_college_info` | `keyword: string` | 搜院校基本信息（办学层次、特色、排名） |
| `search_admission_score` | `college, province, year, subjectType` | 搜历年录取分数线/位次 |
| `search_recruitment_plan` | `college, province, year` | 搜当年招生计划（人数、专业） |
| `calculate_probability` | `score, rank, college, province` | 估算录取概率（历史位次法，本地计算） |
| `generate_html_report` | `plan: object` | 生成符合浅色主题的 HTML 志愿方案 |

搜索类工具内部统一调 Tavily，可加 `include_domains` 限定权威站点：
- `gaokao.chsi.com.cn`（学信网高考）
- 各省考试院官网
- `eol.cn`（中国教育在线）

---

## 7. 数据准确性保障（防幻觉）

1. **Grounding**：所有分数线/招生计划数据必须来自搜索结果，LLM 不得凭记忆生成。
2. **来源标注**：HTML 报告中每个数据点附原始链接，可点击核验。
3. **Prompt 约束**：system prompt 明确"未找到则标注'数据待更新'，严禁编造数字"。
4. **当年数据降级**：若当年数据未发布，用近 3 年历史数据 + 趋势外推，并明确标注"基于历史数据估算"。
5. **位次法优先**：录取概率用"考生位次 vs 院校近 3 年录取位次区间"计算，比单纯比分数更准。

---

## 8. 项目结构

```
gaokao/
├── web/                      # 前端
│   ├── index.html            # 输入表单 + 结果展示
│   ├── app.js                # Fetch 后端、渲染 HTML 报告
│   └── style.css             # 浅色主题
├── api/                      # 后端 API（Express 路由）
│   ├── generate.js           # 主编排：DeepSeek function calling 循环
│   └── tools/
│       ├── search.js         # Tavily 搜索封装
│       ├── probability.js    # 录取概率计算
│       └── report.js         # HTML 报告生成（浅色主题）
├── server.js                 # Express 入口（PM2 守护）
├── ecosystem.config.js       # PM2 配置
├── nginx.conf.example        # Nginx 反代配置示例
├── docs/plans/               # 设计文档
├── .env.example              # API Key 模板
└── package.json
```

### 8.1 ECS 服务器部署清单

| 组件 | 命令/说明 |
|---|---|
| Node.js 22 | `nvm install 22 && nvm use 22` |
| PM2 | `npm i -g pm2` |
| Nginx | `sudo apt install nginx` |
| 代码部署 | `git clone` 到 ECS，`npm install`，`pm2 start ecosystem.config.js` |
| Nginx 反代 | 配置 `proxy_pass http://127.0.0.1:3000` |
| HTTPS（备案后） | `sudo certbot --nginx -d 你的域名` |
| 防火墙 | 阿里云安全组放行 3000（开发期）/ 80,443（上线后） |

---

## 9. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 当年招生计划未发布 | 数据缺失 | 降级用历史数据 + 明确标注 |
| 搜索结果质量差 | 误导决策 | 站点限定权威源；LLM 多轮交叉验证 |
| LLM 编造数据 | 严重误导 | Prompt 强约束 + 来源必附 + 未找到则明示 |
| DeepSeek 限流/宕机 | 服务不可用 | 备选通义/智谱；重试机制 |
| 成本失控 | 费用 | 单次请求搜索次数上限 15；DeepSeek 极低成本 |
| 志愿填报时效性 | 误用 | 明确标注"参考方案，以官方发布为准" |

---

## 10. 成本估算（单次方案生成）

| 项 | 用量 | 成本 |
|---|---|---|
| DeepSeek | 约 5-8 轮调用，20K-30K tokens | 约 ¥0.05-0.15 |
| Tavily | 约 8-15 次搜索 | 免费额度内（1000 次/月） |
| 阿里云 ECS | 已有 | 0（已沉没成本） |
| 带宽/流量 | 按量 | 极低 |
| **合计/次** | | **约 ¥0.05-0.15**（无平台额外费） |

---

## 11. 实现路线图

| 阶段 | 内容 | 产出 |
|---|---|---|
| P1 | 后端 Agent 编排核心（DeepSeek + Tavily + 工具循环） | 可用的 `/api/generate` |
| P2 | 前端输入表单 + 结果渲染 | 可交互页面 |
| P3 | HTML 志愿报告生成（浅色主题、来源标注、冲稳保分层） | 符合规范的 HTML 交付物 |
| P4 | ECS 部署（PM2 + Nginx）+ 端到端测试 | `IP:3000` 可访问 |
| P5 | 提交 ICP 备案（与 P1-P4 并行）→ 备案通过后绑域名 + HTTPS | 正式上线 |

---

## 12. 待确认事项

1. ~~部署平台确认~~ → **已定：阿里云 ECS + PM2 + Nginx**
2. 是否需要支持"新高考"选科匹配（物理/历史 + 再选科目）？
3. API Key 由谁提供：你自备 DeepSeek + Tavily Key，还是需要我先说明如何申请？
4. 是否现在进入实现阶段（P1）？
