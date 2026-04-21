# AI 模型检测工具 - Cloudflare Pages 版

这个版本把后端拆成两个接口，前端可以先展示候选模型，再逐个并发检测可用性，避免长时间“卡住等待”。

## 项目结构

```txt
index.html
functions/
  _lib/
    model-utils.js
  api/
    models.js          # POST /api/models：获取候选模型列表
    check-model.js     # POST /api/check-model：检测单个模型是否可用
    check-models.js    # POST /api/check-models：兼容旧版，一次性检测全部
package.json
```

## 本地运行

```bash
npm install
npm run dev
```

## 部署到 Cloudflare Pages

```bash
npm run deploy
```

Cloudflare Pages 控制台部署时：

```txt
Build command：留空
Build output directory：.
Functions directory：functions
```

## 接口说明

### 1. 获取模型列表

```http
POST /api/models
```

请求：

```json
{
  "apiUrl": "https://ollama.com",
  "apiKey": "sk-xxx"
}
```

返回：

```json
{
  "total": 12,
  "models": [
    { "id": "model-a", "source": "openai-compatible", "status": "pending" }
  ]
}
```

### 2. 检测单个模型

```http
POST /api/check-model
```

请求：

```json
{
  "apiUrl": "https://ollama.com",
  "apiKey": "sk-xxx",
  "model": "model-a",
  "source": "openai-compatible"
}
```

返回：

```json
{
  "id": "model-a",
  "status": "ok",
  "via": "OpenAI-compatible /chat/completions"
}
```

或者：

```json
{
  "id": "model-a",
  "status": "bad",
  "error": "HTTP 404: model not found"
}
```

## 安全处理

后端禁止请求 localhost、私网 IP、IPv6 字面量、169.254.0.0/16 等危险地址，包括：

```txt
http://169.254.169.254
https://169.254.169.254
```

主流 AI 服务商和公网中转站请求可以正常转发。
