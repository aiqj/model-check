import http from "http";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  CORS_HEADERS,
  discoverCandidates,
  normalizeUrl,
  assertSafeApiUrl,
  probeCandidate,
  PROBE_CONCURRENCY
} from "./functions/_lib/model-utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const INDEX_HTML = path.join(PUBLIC_DIR, "index.html");
const MAX_BODY_SIZE = 2 * 1024 * 1024;

function setCorsHeaders(res) {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value);
  }
}

function sendJson(res, data, status = 200) {
  setCorsHeaders(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function sendText(res, text, status = 200, contentType = "text/plain; charset=utf-8") {
  setCorsHeaders(res);
  res.statusCode = status;
  res.setHeader("Content-Type", contentType);
  res.end(text);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("请求体不是合法 JSON"));
      }
    });

    req.on("error", reject);
  });
}

async function concurrentMap(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) break;
      results[index] = await worker(items[index], index);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runner()));
  return results;
}

async function handleModels(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, { error: "Method Not Allowed" }, 405);
  }

  try {
    const body = await readRequestBody(req);
    const apiUrl = normalizeUrl(body.apiUrl || "");
    const apiKey = String(body.apiKey || "").trim();

    if (!apiUrl) {
      return sendJson(res, { error: "apiUrl 不能为空" }, 400);
    }

    assertSafeApiUrl(apiUrl);

    const { models, errors } = await discoverCandidates(apiUrl, apiKey);

    return sendJson(res, {
      total: models.length,
      models: models.map(item => ({
        id: item.id,
        source: item.source || "候选模型",
        status: "pending"
      })),
      errors,
      message: models.length > 0 ? "已获取候选模型" : "没有发现候选模型，请检查 API_URL 或 API_KEY"
    });
  } catch (err) {
    return sendJson(res, { error: err.message || "服务器错误" }, 500);
  }
}

async function handleCheckModel(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, { error: "Method Not Allowed" }, 405);
  }

  try {
    const body = await readRequestBody(req);
    const apiUrl = normalizeUrl(body.apiUrl || "");
    const apiKey = String(body.apiKey || "").trim();
    const model = String(body.model || "").trim();
    const source = String(body.source || "候选模型").trim();

    if (!apiUrl) {
      return sendJson(res, { error: "apiUrl 不能为空" }, 400);
    }

    if (!model) {
      return sendJson(res, { error: "model 不能为空" }, 400);
    }

    assertSafeApiUrl(apiUrl);

    const startedAt = Date.now();
    const result = await probeCandidate({ apiUrl, apiKey, model, source });
    return sendJson(res, {
      ...result,
      responseTimeMs: Date.now() - startedAt
    });
  } catch (err) {
    return sendJson(res, { error: err.message || "服务器错误" }, 500);
  }
}

async function handleCheckModels(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, { error: "Method Not Allowed" }, 405);
  }

  try {
    const body = await readRequestBody(req);
    const apiUrl = normalizeUrl(body.apiUrl || "");
    const apiKey = String(body.apiKey || "").trim();

    if (!apiUrl) {
      return sendJson(res, { error: "apiUrl 不能为空" }, 400);
    }

    assertSafeApiUrl(apiUrl);

    const { models: candidates } = await discoverCandidates(apiUrl, apiKey);

    if (candidates.length === 0) {
      return sendJson(res, {
        total: 0,
        available: [],
        failed: [],
        models: [],
        message: "没有发现候选模型，请检查 API_URL 或 API_KEY"
      });
    }

    const models = await concurrentMap(
      candidates,
      PROBE_CONCURRENCY,
      async candidate => {
        const startedAt = Date.now();
        const result = await probeCandidate({
          apiUrl,
          apiKey,
          model: candidate.id,
          source: candidate.source
        });

        return {
          ...result,
          responseTimeMs: Date.now() - startedAt
        };
      }
    );

    const available = models.filter(item => item.status === "ok").map(item => item.id);
    const failed = models
      .filter(item => item.status === "bad")
      .map(item => ({ id: item.id, error: item.error || "验证失败" }));

    return sendJson(res, {
      total: models.length,
      available,
      failed,
      models
    });
  } catch (err) {
    return sendJson(res, { error: err.message || "服务器错误" }, 500);
  }
}

async function sendIndex(res) {
  try {
    const html = await fs.readFile(INDEX_HTML, "utf8");
    return sendText(res, html, 200, "text/html; charset=utf-8");
  } catch (err) {
    return sendJson(res, { error: "index.html 不存在或无法读取" }, 500);
  }
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (pathname === "/health") {
    return sendJson(res, {
      ok: true,
      name: "model-check",
      mode: "nodejs",
      timestamp: new Date().toISOString()
    });
  }

  if (pathname === "/api/models") {
    return handleModels(req, res);
  }

  if (pathname === "/api/check-model") {
    return handleCheckModel(req, res);
  }

  if (pathname === "/api/check-models") {
    return handleCheckModels(req, res);
  }

  if (pathname.startsWith("/api/")) {
    return sendJson(res, { error: "API Not Found" }, 404);
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJson(res, { error: "Method Not Allowed" }, 405);
  }

  return sendIndex(res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`model-check Node.js server running on http://0.0.0.0:${PORT}`);
});
