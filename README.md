# AI 春联工坊（M3）

已完成能力：
- M1：输入主题后，调用 AI Builder 聊天补全接口生成上联、下联、横批与解释，并支持复制。
- M2：基于生成结果调用 AI Builder 图片接口生成海报，支持预览与下载。
- M3：移动端优化（390px 可用、按钮触控友好、加载/禁用态）、后端可观测与超时控制、交付文档完善。

## 技术栈
- Next.js App Router + TypeScript
- API Route: `POST /api/couplet/generate`
- API Route: `POST /api/couplet/poster`
- 上游聊天接口：`https://space.ai-builders.com/backend/v1/chat/completions`
- 上游图片接口：`https://space.ai-builders.com/backend/v1/images/generations`

## 环境变量
1. 复制示例配置：

```bash
cp .env.example .env.local
```

2. 设置：

- `AI_BUILDER_TOKEN`：AI Builder 鉴权 token（必填）
- `AI_BUILDER_MODEL`：可选，默认 `supermind-agent-v1`
- `AI_BUILDER_IMAGE_MODEL`：可选，默认 `gpt-image-1.5`
- `AI_BUILDER_TIMEOUT_MS`：可选，接口超时毫秒数，范围会被限制在 25000~40000，默认 30000

## 启动

```bash
npm run dev
```

访问 `http://localhost:3000`。

## 自测

```bash
npm run build
npm run smoke
```

`smoke` 会直接验证 AI Builder 聊天接口连通性：
- 若缺少 token：输出可读的 SKIP 提示并退出 0。
- 若有 token：发起一次最小请求并校验返回结构。

## 接口契约

- `POST /api/couplet/generate`
- `POST /api/couplet/poster`
- 两个接口无论成功/失败都会返回 `requestId`，便于排障。

### `POST /api/couplet/generate`

- Request:

```json
{
  "theme": "新年开工",
  "style": "喜庆",
  "industry": "互联网",
  "tone": "稳重",
  "tabooWords": "亏损,裁员"
}
```

- Response:

```json
{
  "data": {
    "topLine": "...",
    "bottomLine": "...",
    "horizontal": "...",
    "explanation": "...",
    "styleTags": ["喜庆", "行业化"]
  },
  "provider": "ai-builder",
  "model": "supermind-agent-v1"
}
```

### `POST /api/couplet/poster`（本地 smoke/curl 示例）

先启动本地服务后执行：

```bash
curl -sS -X POST "http://localhost:3000/api/couplet/poster" \
  -H "Content-Type: application/json" \
  -d '{
    "theme":"新年开工",
    "style":"喜庆国风",
    "topLine":"春风入户千门喜",
    "bottomLine":"瑞气盈庭万事兴",
    "horizontal":"开工大吉"
  }'
```

返回示例（成功）：

```json
{
  "requestId": "9f7f9f95-cf73-4e72-9f5f-fb66fcb11111",
  "data": {
    "imageBase64": "...",
    "imageUrl": null
  },
  "provider": "ai-builder",
  "model": "gpt-image-1.5"
}
```

## 移动端建议（M3）
- 以 `390x844` 视口进行主流程回归：输入、生成、复制、生成海报、下载海报。
- 触控按钮最小高度为 `44px`，避免误触。
- 海报生成期间禁用重复提交，等待加载态结束后再重试。

## 常见错误排查
- `服务暂时不可用（配置缺失）`：检查 `AI_BUILDER_TOKEN` 是否存在。
- `请求参数有误`：检查入参字段是否为空，尤其 `theme/topLine/bottomLine/horizontal`。
- `上游服务暂时不可用（HTTP 5xx/4xx）`：上游波动，可稍后重试。
- `生成请求超时` / `海报生成超时`：网络慢或上游响应慢，可重试并视情况调高 `AI_BUILDER_TIMEOUT_MS`（上限 40000）。
- 前端错误提示中的 `请求编号` 对应接口 `requestId`，可用于服务端日志定位。
