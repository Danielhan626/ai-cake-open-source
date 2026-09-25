# AI Cake / 如意鲜果蛋糕

用 AI 把顾客模糊的蛋糕想法变成可沟通的设计图，再连接能够制作它的本地蛋糕师。

AI Cake 是一套面向微信小程序的 AI 蛋糕设计与本地制作撮合项目。用户可以生成、微调、发布蛋糕作品，也可以基于作品发布制作需求；通过平台审核的蛋糕师可按自身技术、档期和服务范围报价，双方继续完成制作、配送与售后沟通。

> 当前仓库适合学习、二次开发和小规模试运营验证。正式经营涉及微信平台规则、AIGC 合规、商家资质、食品安全、支付结算、隐私保护和当地监管要求，部署者需自行完成相应审核与合规工作。

## 项目缘起

这个项目来自一个很具体的问题：定制蛋糕时，顾客常用抽象描述或网络图片表达想法，销售人员需要反复确认，再把需求转述给蛋糕师；顾客、销售和制作人员对同一句话的理解往往不同。

最初的设想是用 LoRA、ComfyUI 和固定提示词把想法先变成图片。后来项目逐步演化为一套完整流程：用户只需输入简短想法，由模型生成蛋糕设计，再通过图片编辑继续微调；如果用户希望把设计做出来，就发布制作需求，让本地蛋糕师根据真实制作能力选择报价或提出调整建议。

项目经过多年自学和迭代完成。现在公开代码，希望它既能成为 AI 应用开发的参考，也能为真实的小店、手艺人和普通消费者提供一些新的可能。

## 核心闭环

```text
AI Bot 创作任务
  -> 用户生成蛋糕设计
  -> 继续微调图片
  -> 发布作品并获得互动
  -> 发布制作需求
  -> 已审核蛋糕师报价
  -> 用户确认报价意向
  -> 制作与配送/自提
  -> 售后与退款协商
```

项目不替代蛋糕师判断“能不能做”。平台保存创作者的核心构想和可调整项，最终可制作程度由真实商家结合材料、工艺、档期和配送条件报价确认。

## 已实现能力

- 原生微信小程序：设计、作品广场、接单广场、个人中心和订单流程。
- AI 文生图与图片微调：优先支持阿里百炼千问，同时保留 mock、火山方舟和兼容中转适配器。
- 蛋糕创作任务：节日营销日历、任务候选、人工发布、参与和奖励审核。
- 社区互动：作品发布审核、投票、玫瑰、AI 多角色点评、分享和做同款。
- 商家入驻：健康证、营业执照、食品相关资质、作品集和服务范围。
- 制作撮合：需求审核、商家报价、报价选择、订单和履约状态。
- 售后处理：用户提交证据、商家处理、平台客服介入和退款记录。
- 运营后台：内容审核、商家资质审核、待报价需求、订单履约、退款协商和审计日志。
- 微信能力：微信登录、手机号绑定、模糊定位、创作积分充值及微信支付适配。
- 回归门禁：小程序、API、后台、权限、支付、构建和上线准备检查。

## 技术架构

```text
apps/miniprogram   微信原生小程序
apps/api           NestJS API
apps/web-preview   React + Vite 运营后台/本地预览
scripts            回归、部署和上线检查脚本
docs               产品、架构和部署文档
```

主要技术：

- Node.js + npm workspaces
- NestJS + TypeScript
- React + Vite
- 微信原生小程序
- 本地 JSON Store（适合开发和小规模验证）
- 阿里百炼 Qwen Image / Qwen Image Edit
- 微信登录与微信支付 API v3 适配

生产规模扩大前，建议把 JSON Store 迁移到 PostgreSQL/MySQL，并把上传文件迁移到带权限控制的对象存储。

## 快速开始

### 环境要求

- Node.js 20 或更高版本
- npm 10 或更高版本
- 微信开发者工具（运行小程序时需要）

### 安装与启动

```bash
git clone <your-fork-url>
cd ai-cake
npm install
cp .env.example .env
npm run dev
```

本地默认地址：

- API：`http://localhost:4000`
- Web 预览与运营后台：`http://localhost:5173`
- 小程序源码：`apps/miniprogram`

默认配置使用 mock AI 和 mock 支付，不需要真实 API Key 即可体验大部分流程。

### 运行微信小程序

1. 打开微信开发者工具。
2. 导入 `apps/miniprogram`。
3. 使用自己的小程序 AppID，或在开发阶段使用测试号。
4. 确认 `apps/miniprogram/config/index.js` 指向本地或自己的 HTTPS API。
5. 正式上传前完成合法域名、隐私保护指引、服务类目和相关合规配置。

## 环境变量

完整示例见 [.env.example](.env.example)。常用配置包括：

```dotenv
AI_PROVIDER=mock
PAY_PROVIDER=mock
BOT_LLM_PROVIDER=mock
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
```

真实密钥只能放在本地 `.env`、服务器环境变量或密钥管理服务中。不要把 AppSecret、API Key、微信支付私钥、APIv3 Key、管理员口令或客户数据提交到 Git。

### AI 模型

```dotenv
AI_PROVIDER=aliyun
ALIYUN_DASHSCOPE_API_KEY=
ALIYUN_TEXT_IMAGE_MODEL=qwen-image-2.0
ALIYUN_IMAGE_EDIT_MODEL=qwen-image-edit-max
```

### 微信登录与支付

真实微信能力需要自己的小程序账号、AppSecret、微信支付商户配置、证书/公钥和 HTTPS 回调地址。项目不会附带作者的生产密钥或商户配置。

## 验证

日常开发至少运行：

```bash
npm run typecheck
npm run build
npm audit --omit=dev
```

完整第一阶段门禁：

```bash
npm run first-stage:readiness-regression
npm run first-stage:readiness
```

门禁覆盖小程序主要流程、商家身份、登录回跳、内容权限、订单履约、退款、商家后台、AI Provider、微信支付基础层、生产认证边界和构建。

## 生产边界

本仓库不承诺开箱即用的商业合规。实际运营前至少需要确认：

- 小程序认证、备案、服务类目、隐私保护指引和合法域名。
- AIGC 内容标识、内容安全、举报和算法/生成式 AI 合规要求。
- 商家营业执照、健康证及当地要求的食品经营许可或备案。
- 过敏原、食材替换、配送、破损、退款和争议处理规则。
- 微信支付主体、回调、退款、结算、分账、发票和账务规则。
- 用户数据、证件图片和售后凭证的最小化收集、授权访问与保存期限。

## 参与贡献

欢迎提交 Bug、产品建议、文档改进和代码贡献。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

安全问题请不要公开披露，处理方式见 [SECURITY.md](SECURITY.md)。

## 许可与商业合作

本项目采用 [MIT License](LICENSE)。你可以学习、修改、分发和商业使用代码，但须保留许可证与版权声明。MIT 不授予项目名称、Logo、商标或官方背书权利。

商业合作、定制开发、部署支持、市场与广告讨论，可通过 GitHub Issue 联系维护者；请在标题使用 `[Commercial]`，不要在公开 Issue 中提交密钥、客户资料或合同信息。品牌名称和 Logo 的使用规则见 [TRADEMARKS.md](TRADEMARKS.md)。

## 致谢

感谢所有真实蛋糕店、设计者、开发者和测试者提供的场景与反馈。希望这份代码能帮助更多人用先进技术解决日常生活里那些看似细小、但真实存在的沟通问题。
