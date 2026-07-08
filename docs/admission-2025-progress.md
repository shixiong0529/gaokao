# 2025 各省本科批投档线抓取进度

## 字段规则

以 `data/admission/hunan-2025-benke.json` 为基准，所有省份优先整理为 JSON 数组，每条至少包含：

| 字段 | 说明 |
| --- | --- |
| `科类` | 物理、历史、综合、普通类等省内口径 |
| `院校代号` | 省考试院公布的院校/学校代码 |
| `院校名称` | 院校名称 |
| `专业组编号` | 院校专业组编号；没有专业组的省份可用专业代号 |
| `专业组名称` | 院校专业组名称；没有专业组的省份可用专业名称 |
| `投档线` | 最低投档分；官方只公布位次时填 `null` |
| `备注` | 限制条件、缺失说明、计划数、位次等补充信息 |

省份官方表格包含更多可用字段时，允许保留额外字段，例如 `计划数`、`位次`、`最低位次`、`来源`。

## 逐省清单

| 省份 | 状态 | 目标文件 | 官方来源备注 |
| --- | --- | --- | --- |
| 湖南 | 已完成 | `data/admission/hunan-2025-benke.json` | 已有湖南省教育考试院本科批普通类投档线 |
| 浙江 | 已完成 | `data/admission/zhejiang-2025-benke.json` | 浙江省教育考试院普通类第一段平行投档分数线表，17890 行 |
| 山东 | 已完成 | `data/admission/shandong-2025-benke.json` | 山东省教育招生考试院普通类常规批第1次志愿投档情况表，21381 行；官方表只公布最低位次，`投档线` 暂为 `null` |
| 广东 | 已完成 | `data/admission/guangdong-2025-benke.json` | 广东省教育考试院本科普通类历史/物理投档情况，5140 行 |
| 江苏 | 已完成 | `data/admission/jiangsu-2025-benke.json` | 江苏省教育考试院普通类本科批次历史/物理平行志愿投档线，4306 行 |
| 湖北 | 已完成 | `data/admission/hubei-2025-benke.json` | 湖北招生考试网本科普通批历史/物理平行志愿投档分数线，4560 行 |
| 福建 | 已完成 | `data/admission/fujian-2025-benke.json` | 福建省教育考试院本科批常规志愿专业组投档最低分（官方图片 124 页整页 OCR，物理 2302+历史 1076=3378 行；34 行"线上无生源"投档线为 null） |
| 河北 | 已完成 | `data/admission/hebei-2025-benke.json` | 河北省教育考试院本科批历史/物理平行志愿投档情况统计，26151 行 |
| 辽宁 | 已完成 | `data/admission/liaoning-2025-benke.json` | 辽宁招生考试之窗普通类本科批历史/物理投档最低分，14473 行 |
| 重庆 | 已完成 | `data/admission/chongqing-2025-benke.json` | 重庆市教育考试院本科批历史/物理平行志愿招生信息表，15164 行 |
| 四川 | 官方不公开 | `data/admission/sichuan-2025-benke.json` | 2025 年起调档线仅向考生本人提供查询（sceea 官方口径），无公开全表 |
| 安徽 | 已完成 | `data/admission/anhui-2025-benke.json` | 官方图片表经列裁剪 OCR，物理 3229+历史 1456=4685 行，含位次；北大 687/位次106、清华 688/位次85 与官方通报一致；院校名称经 colleges.json 校正 |
| 江西 | 已完成 | `data/admission/jiangxi-2025-benke.json` | 江西省教育考试院本科投档情况统计表PDF(历史1651+物理3592+三校生6=5249行，含位次) |
| 广西 | 已完成 | `data/admission/guangxi-2025-benke.json` | 广西招生考试院2025本科普通批院校专业组投档最低分数线(历史1627+物理3498=5125行)，官网HTML表 |
| 贵州 | 已完成 | `data/admission/guizhou-2025-benke.json` | 贵州省招生考试院普通类本科批投档情况PDF(历史6318+物理18325=24643行，按专业投档，含计划数/位次) |
| 甘肃 | 官方不公开 | `data/admission/gansu-2025-benke.json` | 2025 年起投档及录取信息仅向考生本人及在甘招生高校提供（ganseea.cn 公告原文），无公开全表 |
| 黑龙江 | 已完成 | `data/admission/heilongjiang-2025-benke.json` | 黑龙江省招生考试院官方 XLSX，历史 1257+物理 2790=4047 行 |
| 吉林 | 待补 | `data/admission/jilin-2025-benke.json` | 未检索到官方公开的本科批各专业组投档线全表（jleea 官网仅征集志愿公告，投档线经考生服务平台查询） |
| 河南 | 待补 | `data/admission/henan-2025-benke.json` | 官方数据在 datacenter.haeea.cn（ShowPZTDTJ.aspx?yearTip=2025&pc=1&kl=1 历史 / kl=5 物理），有瑞数反爬需真实浏览器渲染；本次 Chrome 扩展未连接，待浏览器可用时抓取 |
| 北京 | 已完成 | `data/admission/beijing-2025-benke.json` | 北京教育考试院本科普通批录取投档线PDF(1397行，综合类) |
| 天津 | 已完成 | `data/admission/tianjin-2025-benke.json` | 本科批A阶段录取最低分统计表（扫描 PDF 经 Vision OCR，2077 行，序号 1-2077 连续无缺；28 组为“680 分及以上”官方不公布具体分） |
| 上海 | 已完成 | `data/admission/shanghai-2025-benke.json` | 上海市教育考试院本科普通批平行志愿专业组投档线PDF(1379行，综合类；580分及以上不公布具体分，投档线为null) |
| 海南 | 已完成 | `data/admission/hainan-2025-benke.json` | 海南省考试局本科普通批专业组投档分数线官网 HTML 表，2391 行（900 分制综合改革） |
| 山西 | 已完成 | `data/admission/shanxi-2025-benke.json` | 山西招生考试网普通本科批专业组投档最低分PDF(历史1726+物理3462=5188行) |
| 陕西 | 待补 | `data/admission/shaanxi-2025-benke.json` | 官方投档信息经考试院查询系统提供；第三方汇总（北京高考在线 gaokzx 144777/144778）为 JS 渲染页需浏览器 |
| 云南 | 官方不公开 | `data/admission/yunnan-2025-benke.json` | 投档最低分仅向考生本人提供查询（gk.ynzs.cn），无公开全表 |
| 内蒙古 | 已完成 | `data/admission/neimenggu-2025-benke.json` | 内蒙古教育考试院官方 JSON 数据接口，3976 行（历史/物理，含专项、民族班标注） |
| 宁夏 | 待补 | `data/admission/ningxia-2025-benke.json` | 官方本科批B段投档线 PDF 已从 nxjyks.cn 删除（无 Wayback 存档）；现存第三方截图分辨率过低无法可靠 OCR |
| 青海 | 官方不公开 | `data/admission/qinghai-2025-benke.json` | 2025 年起投档录取信息只提供给考生本人和相关高校（青海省教育招生考试院公告），无公开全表 |
| 新疆 | 已完成 | `data/admission/xinjiang-2025-benke.json` | 新疆教育考试院官方图片 OCR+整列复核，本科一批 500 行+本科二批 1055 行=1555 行（文史 654/理工 901，老高考院校级投档，备注注明批次；14 行官方表分数为空） |
| 西藏 | 官方不公开 | `data/admission/xizang-2025-benke.json` | 投档线经西藏教育考试招生信息查询系统（考生登录）提供，未见公开全表 |
