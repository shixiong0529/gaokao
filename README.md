# 高考志愿填报方案生成器

基于 DeepSeek function calling + 结构化数据接口 + 联网搜索的 Agent，为高考毕业生生成**七板块结构化**的志愿填报参考方案。

## 功能特性

- **七板块报告**：执行摘要 / 数据基础 / 分数定位分析 / 冲稳保策略 / 院校详细分析 / 建议志愿表 / 风险提醒 / 来源声明
- **双数据源**：批次线和一分一段来自结构化接口（官方数据），院校录取分来自联网搜索
- **冲稳保分层**：按 k = R_school / R_user 位次比算法判定，冲∶稳∶保 ≈ 3∶4∶3 配比
- **来源三件套**：每条硬数据标注数据项 + 来源 + 采集年份 + 采集时间，可追溯
- **多格式导出**：网页展示 / HTML 下载 / Word 文档下载 / PDF 打印
- **本地轻量数据库**：SQLite 保存用户留言、邀请码和邀请码使用记录
- **邀请码门禁**：生成报告前必须输入有效邀请码，生成失败不消耗邀请码
- **超时保护**：前端 230 秒 + 服务端 250 秒 + Agent 195 秒内部预算 + 单次搜索/接口 8-10 秒超时，多层协同防卡死
- **并发提速**：同一轮内多个搜索并行执行、预取结构化数据并行，大幅缩短总耗时
- **多页站点**：统一「澄明志愿」中式设计风格，含首页表单、志愿参考样例、院校数据库、方案说明、关于我们，导航互通
- **支持省份**：17 个「3+1+2」新高考省份（湘鄂粤苏川冀皖闽赣渝辽豫吉黑桂黔陇）；3+3 模式省份（京津沪浙鲁琼）选科口径不同，前后端均明确拒绝

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
├── web/                      # 前端（澄明志愿 · 站点多页）
│   ├── index.html            # 首页：志愿信息登记表单
│   ├── app.js                # 前端逻辑（fetch + 超时控制 + 报告渲染）
│   ├── reference.html        # 志愿参考：冲稳保案例样本报告页
│   ├── college-data.html     # 院校数据：可搜索/筛选的院校数据库
│   ├── methodology.html      # 方案说明：位次原理 + 四步流程 + 冲稳保逻辑
│   ├── about.html            # 关于我们 + 留言表单
│   ├── privacy.html          # 隐私政策
│   ├── terms.html            # 服务条款
│   ├── admin-invites.html    # 管理员邀请码生成页（不对外链接，直接输 URL 访问）
│   ├── admin-messages.html   # 管理员留言查看页
│   ├── robots.txt            # 屏蔽 admin 页面收录
│   ├── sitemap.xml           # 站点地图
│   └── style.css             # 浅色主题样式
├── api/
│   ├── generate.js           # Agent 编排核心
│   │                         #   - System Prompt（七板块 + 冲稳保配比 + k区间 + 法务约束）
│   │                         #   - function calling 循环（DeepSeek API，瞬时故障重试×3）
│   │                         #   - 预取结构化数据（批次线 + 位次）
│   │                         #   - 强制收尾：超时前用 tool_choice 强制输出七板块
│   │                         #   - 兜底报告：LLM 不可用时用本地官方投档线直接构造
│   │                         #   - JSON 截断修复 + 字符串反序列化 + 字段容错
│   └── tools/
│       ├── search.js         # 搜索封装（Tavily / Bing / DDG 降级链 + 故障冷却）
│       ├── gaokaoData.js     # 结构化数据接口（一分一段 + 批次线）
│       ├── localAdmission.js # 本地官方投档线（湖南本科批，精确到专业组）
│       ├── localDb.js        # SQLite 本地数据库（留言 + 邀请码 + 流程会话）
│       ├── semaphore.js      # 生成并发闸门（排队 + 超时快速失败）
│       ├── docxWorker.js     # Word 转换 worker 线程（不阻塞主线程）
│       └── report.js         # 七板块 HTML 报告生成器
├── server.js                 # Express 入口（静态文件 + API 路由 + 限流 + 超时控制）
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

以下是当前线上部署方式，适用于 `gaokao.moyu.in` 指向同一台阿里云 ECS 的场景。项目目录建议放在 `/opt/gaokao`，服务本身监听内网端口 `3001`，由 Nginx 负责 HTTPS 反向代理。

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

### 域名解析

在阿里云 DNS 中添加 A 记录：

| 主机记录 | 记录类型 | 记录值 |
|----------|----------|--------|
| `gaokao` | A | 服务器公网 IP，例如 `8.148.27.161` |

解析完成后可在服务器上检查：

```bash
dig +short gaokao.moyu.in
```

### 部署代码

```bash
cd /opt
git clone <你的仓库地址> gaokao
cd /opt/gaokao
npm install
cp .env.example .env
nano .env
mkdir -p data logs
```

服务器 `.env` 至少需要配置：

```bash
DEEPSEEK_API_KEY=你的 DeepSeek Key
SEARCH_PROVIDER=tavily
TAVILY_API_KEY=你的 Tavily Key
PORT=3001
DATABASE_PATH=./data/gaokao.db
ADMIN_TOKEN=你的管理员口令
```

注意：每个项目都应该有自己的 `.env`。不要把 `/opt/biscord/.env` 复制覆盖成 `/opt/gaokao/.env`，也不要把 `/opt/gaokao/.env` 放到其他项目目录里。

### PM2 启动

```bash
cd /opt/gaokao
pm2 start ecosystem.config.cjs --name gaokao-advisor
pm2 save
pm2 startup
```

检查服务是否正常：

```bash
curl http://127.0.0.1:3001/api/health
```

### Nginx 反代

首次部署时请先完成下一节的 HTTPS 证书申请，再启用下面这份配置。因为配置里引用了 `/etc/letsencrypt/live/gaokao.moyu.in/` 下的证书文件；证书不存在时，`nginx -t` 会失败。

创建 `/etc/nginx/sites-available/gaokao`：

```nginx
server {
    listen 80;
    server_name gaokao.moyu.in;

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name gaokao.moyu.in;

    ssl_certificate /etc/letsencrypt/live/gaokao.moyu.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gaokao.moyu.in/privkey.pem;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

启用并重载：

```bash
ln -s /etc/nginx/sites-available/gaokao /etc/nginx/sites-enabled/gaokao
nginx -t
systemctl reload nginx
```

### HTTPS 证书

**优先用这个（自动续期，装完不用再管）：**

```bash
certbot --nginx -d gaokao.moyu.in
```

`--nginx` 插件走 HTTP-01，自动改好 nginx 配置、自动申请证书。certbot 安装时自带系统定时任务（systemd timer `certbot.timer` 或 `/etc/cron.d/certbot`），到期前自动续期，永久不用手动操作。

> 首次执行前确认：阿里云 ECS 安全组的入方向规则已放行公网 `80` 端口（`0.0.0.0/0`）；如果开了 WAF / 云盾，注意其对**境外来源 IP** 的默认拦截规则——Let's Encrypt 验证节点大多在境外，会被当成可疑流量拦掉，出现"本机 curl 能访问、Certbot 校验却返回 403"的现象。需要给 WAF 加白名单或临时关闭后再重试。

**如果 80 端口验证长期走不通**（比如安全策略不允许对外开放、WAF 规则无法调整），改用 DNS-01 + 阿里云 DNS API 自动应答，同样能全自动续期，且完全不依赖 80 端口：

```bash
curl https://get.acme.sh | sh -s email=你的邮箱
source ~/.bashrc

# 阿里云 RAM 控制台建一个子账号 AccessKey，只给 AliyunDNSFullAccess 权限（不要用主账号 AK）
export Ali_Key="你的AccessKeyId"
export Ali_Secret="你的AccessKeySecret"

~/.acme.sh/acme.sh --issue --dns dns_ali -d gaokao.moyu.in

~/.acme.sh/acme.sh --install-cert -d gaokao.moyu.in \
  --key-file       /etc/letsencrypt/live/gaokao.moyu.in/privkey.pem \
  --fullchain-file /etc/letsencrypt/live/gaokao.moyu.in/fullchain.pem \
  --reloadcmd      "systemctl reload nginx"
```

`acme.sh` 会自己写 cron，到期前用同一个 AccessKey 自动改 DNS TXT 记录、自动续期、自动 reload nginx，不需要再手动去控制台粘贴 TXT 值。

<details>
<summary>历史记录：首次证书是怎么申请下来的（手动 DNS 验证，不会自动续期）</summary>

当时 `certbot --webroot` / `--standalone` 在 HTTP-01 校验时持续返回 `403`（本机 curl 能访问，但验证服务器不行，符合上面提到的 WAF 境外 IP 拦截特征），临时用了手动 DNS 验证兜底：

```bash
certbot certonly \
  --manual \
  --preferred-challenges dns \
  --cert-name gaokao.moyu.in \
  --key-type rsa \
  -d gaokao.moyu.in
```

按 Certbot 提示，在阿里云 DNS 中添加 TXT 记录：

| 主机记录 | 记录类型 | 记录值 |
|----------|----------|--------|
| `_acme-challenge.gaokao` | TXT | Certbot 给出的 token |

确认 TXT 生效后再按回车继续：

```bash
dig +short TXT _acme-challenge.gaokao.moyu.in
```

这种方式生成的证书**不会自动续期**（`certbot renew` 非交互执行，manual 插件无法弹出提示要求你粘贴新的 TXT 值，会静默失败）。当前证书到期日 `2026-09-29`，已改用上面的自动化方案，到期前无需再手动操作；如果发现还是走的这条旧路径，务必切换到方案 A 或 B。

</details>

### 日常更新

本地代码 push 后，服务器更新：

```bash
cd /opt/gaokao
git pull
npm install
pm2 restart gaokao-advisor --update-env
```

如果只改了 `.env`，执行：

```bash
pm2 restart gaokao-advisor --update-env
```

## 环境变量说明

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DEEPSEEK_API_KEY` | DeepSeek API Key（必填） | - |
| `DEEPSEEK_BASE_URL` | DeepSeek API 地址 | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 模型名 | `deepseek-chat` |
| `SEARCH_PROVIDER` | 搜索引擎（ddg/bing/tavily） | `ddg` |
| `SEARCH_MAX_CALLS` | 单次请求最大搜索次数 | `15` |
| `SEARCH_TIMEOUT_MS` | 单次搜索超时（毫秒） | `10000` |
| `GAOKAO_TIMEOUT_MS` | 结构化接口单次请求超时（毫秒） | `8000` |
| `TAVILY_API_KEY` | Tavily Key（provider=tavily 时必填） | - |
| `DATABASE_PATH` | SQLite 数据库文件路径，生产建议使用 `./data/gaokao.db` 避免与其他项目重名 | `./data/app.db` |
| `ADMIN_TOKEN` | 管理员 API/邀请码页面口令 | - |
| `GENERATE_MAX_CONCURRENT` | 同时生成报告的全局上限，超出排队 | `8` |
| `GENERATE_QUEUE_MAX` | 生成排队队列长度上限，超出立即拒绝 | `10` |
| `GENERATE_QUEUE_WAIT_MS` | 排队最长等待时间（毫秒），超时拒绝 | `30000` |
| `AGENT_MAX_ROUNDS` | Agent 最大循环轮数 | `6` |
| `AGENT_DEADLINE_MS` | Agent 总时间预算，超过不再开新一轮（毫秒） | `195000` |
| `DEEPSEEK_TIMEOUT_MS` | 单次 DeepSeek 调用超时上限（毫秒） | `120000` |
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
- **本地存储**：SQLite（留言、邀请码、使用记录）
- **前端**：原生 HTML + CSS + JS（无框架）
- **部署**：PM2 + Nginx

## 邀请码与留言

- 留言表单提交到 `POST /api/messages`，保存到 SQLite。
- 管理员访问 `/admin-invites.html`，输入 `.env` 中的 `ADMIN_TOKEN` 后可生成邀请码。
- 用户生成报告时必须填写邀请码。后端会先预占邀请码；报告生成成功后确认消耗，生成失败或超时会释放本次预占。
- SQLite 文件建议放在 `./data/gaokao.db`，不要提交到 Git；生产环境请定期备份该文件。

## 免责声明

本工具基于 AI + 联网搜索生成参考方案，数据可能存在延迟或偏差。志愿填报是重大决策，请以各省教育考试院官方发布为准。本方案不构成任何填报、录取或决策的承诺与建议，最终决定请结合官方信息综合判断。
