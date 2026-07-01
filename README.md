# 高考志愿填报方案生成器

基于 DeepSeek function calling + 结构化数据接口 + 联网搜索的 Agent，为高考毕业生生成**七板块结构化**的志愿填报参考方案。

## 功能特性

- **七板块报告**：执行摘要 / 数据基础 / 分数定位分析 / 冲稳保策略 / 院校详细分析 / 建议志愿表 / 风险提醒 / 来源声明
- **双数据源**：批次线和一分一段来自结构化接口（官方数据），院校录取分来自联网搜索
- **冲稳保分层**：按 k = R_school / R_user 位次比算法判定，冲∶稳∶保 ≈ 3∶4∶3 配比
- **来源三件套**：每条硬数据标注数据项 + 来源 + 采集年份 + 采集时间，可追溯
- **多格式导出**：网页展示 / HTML 下载 / Word 文档下载 / PDF 打印
- **超时保护**：前端 180 秒 + DeepSeek 120 秒 + 服务端 200 秒三层超时控制

## 快速开始

### 1. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入你的 DeepSeek API Key
```

DeepSeek Key 申请：https://platform.deepseek.com/ → 创建 API Key

### 2. 本地运行

```bash
npm install
npm start
# 打开 http://localhost:3000
```

### 3. 搜索引擎配置

- 开发期默认用 **DuckDuckGo**（免费无 Key，立即可用）
- 上线时在 `.env` 设置 `SEARCH_PROVIDER=tavily` 并填入 Tavily Key 即可切换
- Tavily 注册送 1000 次/月：https://tavily.com/

## 工作原理

```
用户填表单 → 后端预取结构化数据（批次线+位次）
           → DeepSeek function calling 循环：
             ├─ search_admission_score（联网搜索院校录取分）
             ├─ search_college_info（联网搜索院校信息）
             ├─ search_subject_requirement（联网搜索选科要求）
             └─ finish（输出七板块结构化方案）
           → 后端生成 HTML 报告返回前端
```

### 数据来源

| 数据类型 | 来源 | 工具 | 说明 |
|---------|------|------|------|
| 批次线（本科批/专科批/特控线） | 结构化数据接口 | `query_batch_line` | 官方数据，准确 |
| 一分一段（分数→位次） | 结构化数据接口 | `query_rank` | 官方数据，准确 |
| 院校录取分数线 | 联网搜索 | `search_admission_score` | 来自 eol.cn 等教育网站 |
| 院校基本信息 | 联网搜索 | `search_college_info` | 来自阳光高考平台 |
| 选科要求 | 联网搜索 | `search_subject_requirement` | 来自教育在线 |

> 结构化数据接口（`gaokao.search.qq.com`）当前公开可访问，商用前需确认授权。

### 性能优化

- **预取结构化数据**：agent 循环前直接调结构化接口拿批次线和位次，省 2 轮 LLM 调用
- **搜索缓存**：相同查询不重复调用
- **JSON 容错**：栈模拟修复截断的 JSON + 字符串字段自动反序列化 + 字段类型校验

## 项目结构

```
gaokao/
├── web/                      # 前端
│   ├── index.html            # 表单页
│   ├── app.js                # 前端逻辑（fetch + 超时控制 + 报告渲染）
│   └── style.css             # 浅色主题样式
├── api/
│   ├── generate.js           # Agent 编排核心
│   │                         #   - System Prompt（七板块 + 冲稳保配比 + k区间 + 法务约束）
│   │                         #   - function calling 循环（DeepSeek API）
│   │                         #   - 预取结构化数据（批次线 + 位次）
│   │                         #   - JSON 截断修复 + 字符串反序列化 + 字段容错
│   │                         #   - 来源三件套收集
│   └── tools/
│       ├── search.js         # 搜索封装（DDG / Bing / Tavily 三后端）
│       ├── gaokaoData.js     # 结构化数据接口（一分一段 + 批次线）
│       ├── probability.js    # 录取概率算法（k = R_school / R_user）
│       └── report.js         # 七板块 HTML 报告生成器
├── server.js                 # Express 入口（静态文件 + API 路由 + 超时控制）
├── ecosystem.config.cjs      # PM2 配置
├── nginx.conf.example        # Nginx 反代配置
├── docs/plans/               # 设计文档
└── .env                      # 环境变量（API Key 等）
```

## 报告结构（七板块）

| 板块 | 内容 |
|------|------|
| 一、执行摘要 | 考生信息键值表 + 核心结论 |
| 二、数据基础 | 当年+去年批次线 + 院校录取参考表 |
| 三、志愿填报策略 | 分数定位分析 + 冲稳保三层策略（🔴🟡🟢） |
| 四、推荐院校详细分析 | 院校卡片（所在地/类型/硕士点/优势学科/分析） |
| 五、建议志愿表 | 序号/冲稳保/院校/所在地/参考分/服从调剂建议 |
| 六、风险提醒与注意事项 | 时效性/选科匹配/专业调剂/特殊招生/单科成绩 |
| 七、来源与时效声明 | 数据项 + 来源 + 采集年份 + 采集时间 |

## 冲稳保判定算法

采用位次比 k = R_school / R_user（位次越小越好）：

| 分类 | k 值范围 | 含义 | 概率区间 |
|------|---------|------|---------|
| 冲 | 0.80 ≤ k < 0.95 | 院校位次高于我，有希望但不稳 | 15-30% |
| 稳 | 0.95 ≤ k ≤ 1.08 | 与我相当或略优 | 30-75% |
| 保 | k > 1.08 | 明显低于我，兜底 | 75-95% |

加权位次：近1年权重 0.5 / 近2年 0.3 / 近3年 0.2

## 部署到阿里云 ECS

### 环境准备

```bash
# 安装 Node.js 22
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 22

# 安装 PM2
npm i -g pm2

# 安装 Nginx
sudo apt update && sudo apt install -y nginx
```

### 部署代码

```bash
git clone <你的仓库地址> gaokao
cd gaokao
npm install
cp .env.example .env
# 编辑 .env 填入真实 Key
mkdir -p logs

# PM2 启动
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # 开机自启
```

### Nginx 反代

```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/gaokao
sudo ln -s /etc/nginx/sites-available/gaokao /etc/nginx/sites-enabled/
sudo nginx -t && sudo nginx -s reload
```

### HTTPS

```bash
sudo certbot --nginx -d 你的域名
```

## 环境变量说明

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DEEPSEEK_API_KEY` | DeepSeek API Key（必填） | - |
| `DEEPSEEK_BASE_URL` | DeepSeek API 地址 | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 模型名 | `deepseek-chat` |
| `SEARCH_PROVIDER` | 搜索引擎（ddg/bing/tavily） | `ddg` |
| `SEARCH_MAX_CALLS` | 单次请求最大搜索次数 | `15` |
| `TAVILY_API_KEY` | Tavily Key（provider=tavily 时必填） | - |
| `AGENT_MAX_ROUNDS` | Agent 最大循环轮数 | `6` |
| `PORT` | 服务端口 | `3000` |

## 成本估算

| 项目 | 单次成本 |
|------|---------|
| DeepSeek API（5-8 轮调用） | 约 ¥0.05-0.15 |
| 结构化数据接口 | 免费 |
| 搜索（DDG） | 免费 |
| 搜索（Tavily） | 免费额度内 |

## 技术栈

- **后端**：Node.js 22 + Express
- **AI**：DeepSeek Chat（function calling）
- **数据**：腾讯高考结构化接口 + 联网搜索（DuckDuckGo/Tavily）
- **前端**：原生 HTML + CSS + JS（无框架）
- **部署**：PM2 + Nginx

## 免责声明

本工具基于 AI + 联网搜索生成参考方案，数据可能存在延迟或偏差。志愿填报是重大决策，请以各省教育考试院官方发布为准。本方案不构成任何填报、录取或决策的承诺与建议，最终决定请结合官方信息综合判断。
