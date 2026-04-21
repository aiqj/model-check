import {
  CORS_HEADERS,
  jsonResponse,
  normalizeUrl,
  assertSafeApiUrl,
  probeCandidate
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
    const model = String(body.model || "").trim();
    const source = String(body.source || "候选模型").trim();

    if (!apiUrl) {
      return jsonResponse({ error: "apiUrl 不能为空" }, 400);
    }

    if (!model) {
      return jsonResponse({ error: "model 不能为空" }, 400);
    }

    assertSafeApiUrl(apiUrl);

    const result = await probeCandidate({ apiUrl, apiKey, model, source });
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message || "服务器错误" }, 500);
  }
}
