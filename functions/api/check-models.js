import {
  CORS_HEADERS,
  discoverCandidates,
  jsonResponse,
  normalizeUrl,
  assertSafeApiUrl,
  probeCandidate,
  PROBE_CONCURRENCY
} from "../_lib/model-utils.js";

export async function onRequest(context) {
  const request = context.request;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const apiUrl = normalizeUrl(body.apiUrl || "");
    const apiKey = String(body.apiKey || "").trim();

    if (!apiUrl) {
      return jsonResponse({ error: "apiUrl 不能为空" }, 400);
    }

    assertSafeApiUrl(apiUrl);

    const { models: candidates } = await discoverCandidates(apiUrl, apiKey);

    if (candidates.length === 0) {
      return jsonResponse({
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
      candidate => probeCandidate({
        apiUrl,
        apiKey,
        model: candidate.id,
        source: candidate.source
      })
    );

    const available = models.filter(item => item.status === "ok").map(item => item.id);
    const failed = models
      .filter(item => item.status === "bad")
      .map(item => ({ id: item.id, error: item.error || "验证失败" }));

    return jsonResponse({
      total: models.length,
      available,
      failed,
      models
    });
  } catch (err) {
    return jsonResponse({ error: err.message || "服务器错误" }, 500);
  }
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

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runner());
  await Promise.all(workers);
  return results;
}
