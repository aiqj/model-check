import {
  CORS_HEADERS,
  discoverCandidates,
  jsonResponse,
  normalizeUrl,
  assertSafeApiUrl
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

    const { models, errors } = await discoverCandidates(apiUrl, apiKey);

    return jsonResponse({
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
    return jsonResponse({ error: err.message || "服务器错误" }, 500);
  }
}
