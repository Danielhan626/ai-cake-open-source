# 如意鲜果蛋糕技术方案

## 1. 推荐方案

- 微信端：微信小程序原生，只做微信小程序。
- 本地预览：Vite + React，用于电脑浏览器快速跑通流程。
- 后端：NestJS。
- 本地数据：JSON 文件存储，后续可替换为 SQLite/PostgreSQL + Prisma。
- AI 图像生成：默认 mock，本地不依赖真实密钥；当前优先接入阿里百炼千问，`qwen-image-2.0` 负责文生图，`qwen-image-edit-max` 负责已有作品微调编辑，保留火山方舟和中转适配器。
- 支付：创作积分充值已接入真实微信支付服务器运行态；蛋糕制作订单第一阶段仍先做报价意向确认，暂不扩展为平台担保交易。
- 试运营城市：山西长治。
- 蛋糕师入驻资质：审核版至少健康证、蛋糕店营业执照；店铺正式承接制作订单前，平台需按当地要求核验食品经营许可证或食品经营相关备案/许可。
- 产品名：如意鲜果蛋糕。

## 2. 为什么这样选

微信小程序原生适合第一版快速提交审核和上线；NestJS 适合把用户、作品、需求、蛋糕师、报价、支付、AI 生成拆成清晰模块；本地 JSON 存储能保证你电脑上先跑通，避免数据库安装和原生依赖编译阻塞。

后续正式开发时，只需要把数据层从 `StoreService` 换成数据库仓储，不需要重写业务接口。

## 3. AI 接入策略

第一版提供四个模式：

- `mock`：默认模式，返回本地 SVG 图片，方便开发。
- `aliyun`：阿里百炼 DashScope 多模态生成接口，文生图默认 `qwen-image-2.0`，微调编辑默认 `qwen-image-edit-max`。
- `volcengine`：保留火山方舟接口。
- `relay`：保留 OpenAI-compatible 中转接口。

实际部署时通过 `AI_PROVIDER` 环境变量切换。

阿里百炼配置项：

- `ALIYUN_DASHSCOPE_API_KEY`：百炼 API Key，必须只放在运行环境变量或本机忽略提交的 `.env`，不要写入源码。
- `ALIYUN_DASHSCOPE_BASE_URL`：默认 `https://dashscope.aliyuncs.com`。
- `ALIYUN_TEXT_IMAGE_MODEL`：默认 `qwen-image-2.0`，用于首次文生图。
- `ALIYUN_IMAGE_EDIT_MODEL`：默认 `qwen-image-edit-max`，用于“继续微调设计”。
- `ALIYUN_IMAGE_SIZE`：文生图尺寸，示例 `2048*2048`。
- `ALIYUN_IMAGE_EDIT_SIZE`：微调编辑尺寸，示例 `1328*1328`。

注意：`qwen-image-edit-max` 是图片编辑模型，不是纯文生图模型。当前方案把它放在微调模块：用户先通过 `/works/generate` 得到 `qwen-image-2.0` 文生图作品，再通过 `/works/:id/refine` 把当前作品图和微调要求传入编辑模型，生成一个新的待审核作品。

Prompt 不散落硬编码在 provider 内部。当前统一由 `apps/api/src/ai/prompt-template.ts` 生成：

- `PROMPT_VERSION`：标记提示词规则版本，方便回溯和 A/B 测试。
- `AI_PROMPT_PROFILE=social-game`：默认游戏化分享场景。
- `AI_PROMPT_PROFILE=production`：偏蛋糕师制作参考场景。
- `negativePrompt`：统一约束低质量、侵权、商标、真实人物脸、二维码和不可制作结构。

Provider 只负责把统一 prompt 转成供应商请求。未来切千问新接口、火山新模型或中转服务时，优先保持 `/works/generate` 输入输出不变。

## 4. AI Bot 文案与任务策略

v0.3 起，图片生成和 AI Bot 文案生成分开：

- 图片生成仍由 `AI_PROVIDER` 控制，负责 `/works/generate` 和 `/works/:id/refine`。
- AI Bot 文案由 `BOT_LLM_PROVIDER` 控制，负责每日任务候选和作品多角色点评。
- `BOT_LLM_PROVIDER=mock` 是默认体验模式，不依赖真实密钥。
- `BOT_LLM_PROVIDER=doubao` 或 `deepseek` 时，服务端用 OpenAI-compatible chat completions 方式调用境内可用文本模型。
- 大模型生成的任务先以 `candidate` 状态落库，不直接进入前端展示；前端只展示 `active` 任务。
- 缺少 `BOT_LLM_API_KEY` 或外部模型失败时，系统回退 mock 任务/点评，不影响生图链路。

AI Bot 配置项：

- `BOT_LLM_PROVIDER=mock`
- `BOT_LLM_BASE_URL=`
- `BOT_LLM_API_KEY=`
- `BOT_LLM_MODEL=`
- `BOT_LLM_TIMEOUT_MS=12000`

v0.3 任务接口：

- `GET /design-tasks/today?userId=...`：今日可参与任务，含参与/完成/奖励状态。
- `POST /design-tasks/generate-candidates`：生成候选任务，默认不公开展示。
- `POST /design-tasks/:id/join`：用户接任务。
- `POST /design-tasks/:id/complete`：作品完成任务，生成待审核灵感券。
- `POST /bot-reviews/work`：生成作品多角色点评，失败时回退本地模板。

## 5. 身份与权限策略

本地开发可以通过 `/auth/dev-login` 获得体验 token，便于 H5 预览和 smoke 测试不依赖微信 AppSecret。生产环境禁用 dev-login。

真实小程序登录走 `/auth/wechat-login`，手机号绑定走 `/auth/phone-login`，两个接口都会返回服务端 session token。业务写接口在生产环境必须通过 `Authorization: Bearer <token>` 解析当前用户，不能信任前端 body/query 里单独声明的 `userId`。

当前已在作品发布、需求发布、蛋糕师入驻、报价、选择报价、支付创建、互动和上传接口接入 actor 解析。后续接入正式后台账号时，需要继续把 admin operator 从请求体改为后台登录态。

## 6. 支付接入策略

当前真实微信支付只用于“创作积分充值”，用来覆盖 AI 生图/微调成本；蛋糕制作订单仍先完成报价意向确认，避免过早引入担保交易、结算、分账和食品交易争议复杂度。

本地开发默认可用 `PAY_PROVIDER=mock`，生产商业运行态要求 `PAY_PROVIDER=wechat` 并通过 `/health.wechatPayConfigured=true` 证明环境齐全。小程序端根据 `/health` 运行态决定创作积分充值是否可用；蛋糕订单侧用户看到的是“选择报价/确认意向”。

- `timeStamp`
- `nonceStr`
- `package`
- `signType`
- `paySign`

当前代码层已经不只是支付占位：

- `POST /payments` 在 `PAY_PROVIDER=wechat` 时会走微信支付 JSAPI/小程序下单
- `POST /payments/:id/sync` 会按 `out_trade_no` 查询支付状态
- `POST /payments/wechat/notify` 会验签并处理支付成功/退款结果通知
- 商家同意退款时，后端会优先尝试走微信退款 API `/v3/refund/domestic/refunds`
- `POST /creation-credits/recharge-orders` 会创建创作积分充值订单，并在真实支付成功后增加积分余额

但生产是否真能稳定收款/退款，仍取决于真实商户 env、回调域名、版本路由和真机验证；服务器配置已上线不等于真实手机支付 smoke 已完成。

当前代码库已经补上第一层支付基础设施，在 `apps/api/src/payments/wechat-pay.utils.ts`：

- `listWechatPayConfigProblems()`：检查 `WECHAT_APP_ID`、`WECHAT_MCH_ID`、`WECHAT_PAY_NOTIFY_URL`、`WECHAT_PAY_MERCHANT_SERIAL_NO`、`WECHAT_PAY_PRIVATE_KEY_PEM`、`WECHAT_PAY_PUBLIC_KEY_ID`、`WECHAT_PAY_PUBLIC_KEY_PEM`、`WECHAT_PAY_API_V3_KEY`
- `buildWechatPayAuthorization()`：按 API v3 官方格式生成商户请求签名头
- `buildMiniProgramPaySign()`：生成小程序 `wx.requestPayment` 所需 `paySign`
- `verifyWechatPaySignature()`：验证响应或回调签名
- `decryptWechatPayResource()`：解开 APIv3 回调 `resource.ciphertext`

配套离线回归：

- `npm run wechat-pay-crypto-regression`
- `npm run wechat-pay-live-regression`

这两条回归都不依赖真实商户密钥；第二条会用临时 RSA 密钥、伪造 WeChat API 响应和 AES-GCM 样本验证以下链路：

- JSAPI 下单
- 支付状态查询
- 支付成功回调
- 微信退款创建
- 退款成功/关闭回调

## 7. 本地端口

- API：`http://localhost:4000`
- H5 预览：`http://localhost:5173`

## 8. 开发顺序

1. 项目基础与本地运行。
2. AI 生成与作品保存。
3. 需求发布。
4. 蛋糕师入驻。
5. 报价闭环。
6. 报价意向确认；后端支付占位仅用于开发验证。
7. 小程序页面对接。

## 9. 官方文档参考

- 阿里云百炼千问图片编辑 API：https://help.aliyun.com/zh/model-studio/qwen-image-edit-api
- 阿里云百炼通义万相图像生成与编辑 API：https://help.aliyun.com/zh/model-studio/wan-image-generation-and-editing-api-reference
- 火山方舟图片生成 API：https://www.volcengine.com/docs/82379/1541523?lang=zh
- 微信支付 JSAPI/小程序下单：https://pay.wechatpay.cn/doc/v3/merchant/4012791897
