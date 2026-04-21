export const TIMEOUT_MS = 16000;
export const PROBE_CONCURRENCY = 12;
export const MAX_PROBE_MODELS = 300;

// true：允许用户填写任意公网 AI 服务商 / 中转站。
// false：只允许 ALLOW_HOSTS 里的域名。
export const ALLOW_ANY_PUBLIC_HOST = true;

export const ALLOW_HOSTS = [
  "ollama.com",
  "api.openai.com",
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
  "api.deepseek.com",
  "api.mistral.ai",
  "api.groq.com",
  "api.x.ai",
  "openrouter.ai",
  "api.siliconflow.cn",
  "api.moonshot.cn",
  "open.bigmodel.cn",
  "dashscope.aliyuncs.com"
];

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

export function normalizeUrl(input) {
  let url = String(input || "").trim();
  if (!url) return "";

  // 允许用户省略 https://，例如 api.openai.com/v1
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }

  return url.replace(/\/+$/, "");
}

export function assertSafeApiUrl(rawUrl) {
  let url;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("API_URL 不是合法 URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("API_URL 只允许 http 或 https");
  }

  if (url.username || url.password) {
    throw new Error("API_URL 不允许包含用户名或密码");
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");

  if (isForbiddenHost(host)) {
    throw new Error("API_URL 指向了不允许访问的地址");
  }

  if (!ALLOW_ANY_PUBLIC_HOST) {
    const allowed = ALLOW_HOSTS.some(
      allowedHost => host === allowedHost || host.endsWith("." + allowedHost)
    );

    if (!allowed) {
      throw new Error("API_URL 不在允许的 AI 服务商白名单中");
    }
  }
}

function isForbiddenHost(host) {
  if (!host) return true;

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "local" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home") ||
    host.endsWith(".lan")
  ) {
    return true;
  }

  // 禁止 IPv6 字面量。需要支持 IPv6 服务商时，可单独放开公网 IPv6。
  if (host.includes(":")) return true;

  // 禁止十进制整数形式 IP，如 2130706433；也禁止 0x 开头形式。
  if (/^\d+$/.test(host) || /^0x/i.test(host)) return true;

  if (isIPv4(host)) {
    return isForbiddenIPv4(host);
  }

  return false;
}

function isIPv4(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function parseIPv4(host) {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4) return null;
  if (parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return parts;
}

function isForbiddenIPv4(host) {
  const p = parseIPv4(host);
  if (!p) return true;

  const [a, b] = p;

  // 0.0.0.0/8
  if (a === 0) return true;

  // 10.0.0.0/8
  if (a === 10) return true;

  // 100.64.0.0/10
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8
  if (a === 127) return true;

  // 169.254.0.0/16，包含 169.254.169.254
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;

  // 192.0.0.0/24
  if (a === 192 && b === 0) return true;

  // 198.18.0.0/15
  if (a === 198 && (b === 18 || b === 19)) return true;

  // multicast / reserved
  if (a >= 224) return true;

  return false;
}

function baseFromUrl(rawUrl) {
  let url = normalizeUrl(rawUrl);

  url = url
    .replace(/\/v1\/models$/i, "")
    .replace(/\/v1\/chat\/completions$/i, "")
    .replace(/\/v1\/responses$/i, "")
    .replace(/\/v1\/completions$/i, "")
    .replace(/\/v1\/embeddings$/i, "")
    .replace(/\/v1\/messages$/i, "")
    .replace(/\/api\/tags$/i, "")
    .replace(/\/api\/chat$/i, "")
    .replace(/\/api\/generate$/i, "")
    .replace(/\/v1beta\/models$/i, "/v1beta")
    .replace(/\/v1\/models$/i, "/v1");

  return url;
}

function baseNoV1(base) {
  return normalizeUrl(base)
    .replace(/\/v1$/i, "")
    .replace(/\/v1beta$/i, "");
}

function openAIBase(base) {
  const b = normalizeUrl(base);
  return b.endsWith("/v1") ? b : `${baseNoV1(b)}/v1`;
}

function geminiBase(base) {
  const b = normalizeUrl(base);

  if (/\/v1beta$/i.test(b) || /\/v1$/i.test(b)) {
    return b;
  }

  return `${b}/v1beta`;
}

function headersOpenAI(apiKey) {
  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json"
  };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  return headers;
}

function headersAnthropic(apiKey) {
  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01"
  };

  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  return headers;
}

function headersGemini(apiKey) {
  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json"
  };

  if (apiKey) {
    headers["x-goog-api-key"] = apiKey;
  }

  return headers;
}

function headersOllama() {
  return {
    "Accept": "application/json",
    "Content-Type": "application/json"
  };
}

async function fetchJson(url, options = {}) {
  assertSafeApiUrl(url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    const text = await res.text();
    let json = null;

    if (text && (text.trim().startsWith("{") || text.trim().startsWith("["))) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    if (!res.ok) {
      const msg =
        json?.error?.message ||
        json?.message ||
        text.slice(0, 300) ||
        res.statusText;

      throw new Error(`HTTP ${res.status}: ${msg}`);
    }

    return json ?? text;
  } finally {
    clearTimeout(timer);
  }
}

function pickModelId(item) {
  if (typeof item === "string") return item;

  if (!item || typeof item !== "object") {
    return null;
  }

  return item.id || item.name || item.model || item.model_name || item.slug || null;
}

function extractModels(json, source) {
  let arr = [];

  if (Array.isArray(json)) arr = json;
  else if (Array.isArray(json?.data)) arr = json.data;
  else if (Array.isArray(json?.models)) arr = json.models;
  else if (Array.isArray(json?.model_list)) arr = json.model_list;
  else if (Array.isArray(json?.available_models)) arr = json.available_models;

  return arr
    .map(item => {
      const id = pickModelId(item);

      if (!id) {
        return null;
      }

      return {
        id,
        source
      };
    })
    .filter(Boolean);
}

function uniqCandidates(candidates) {
  const map = new Map();

  for (const item of candidates) {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  }

  return [...map.values()];
}

export async function discoverCandidates(apiUrl, apiKey) {
  const raw = normalizeUrl(apiUrl);
  const base = baseFromUrl(raw);
  const candidates = [];
  const errors = [];
  const tasks = [];

  function addDiscovery(name, url, headers) {
    tasks.push(async () => {
      try {
        const json = await fetchJson(url, {
          method: "GET",
          headers
        });

        candidates.push(...extractModels(json, name));
      } catch (err) {
        errors.push({ source: name, message: err.message });
      }
    });
  }

  if (/\/models$/i.test(raw)) {
    addDiscovery("direct-models", raw, headersOpenAI(apiKey));
    addDiscovery("direct-models-anthropic", raw, headersAnthropic(apiKey));
  }

  if (/\/api\/tags$/i.test(raw)) {
    addDiscovery("direct-ollama-tags", raw, headersOllama());
  }

  addDiscovery("openai-compatible", `${openAIBase(base)}/models`, headersOpenAI(apiKey));
  addDiscovery("anthropic", `${openAIBase(base)}/models`, headersAnthropic(apiKey));
  addDiscovery("ollama", `${baseNoV1(base)}/api/tags`, headersOllama());

  const gBase = geminiBase(base);
  const geminiUrl = apiKey
    ? `${gBase}/models?key=${encodeURIComponent(apiKey)}`
    : `${gBase}/models`;

  addDiscovery("gemini", geminiUrl, headersGemini(apiKey));

  await Promise.allSettled(tasks.map(task => task()));

  return {
    models: uniqCandidates(candidates).slice(0, MAX_PROBE_MODELS),
    errors
  };
}

function modelLooksEmbedding(model) {
  return /embed|embedding|bge|e5|text-embedding/i.test(model);
}

function modelLooksClaude(model) {
  return /^claude-|anthropic/i.test(model);
}

function modelLooksGemini(model) {
  return /gemini|models\//i.test(model);
}

async function probeOpenAIChat(base, apiKey, model) {
  const url = `${openAIBase(base)}/chat/completions`;

  const body = {
    model,
    messages: [
      {
        role: "user",
        content: "ping"
      }
    ],
    max_tokens: 1,
    temperature: 0,
    stream: false
  };

  await fetchJson(url, {
    method: "POST",
    headers: headersOpenAI(apiKey),
    body: JSON.stringify(body)
  });

  return "OpenAI-compatible /chat/completions";
}

async function probeOpenAIResponses(base, apiKey, model) {
  const url = `${openAIBase(base)}/responses`;

  const body = {
    model,
    input: "ping",
    max_output_tokens: 1
  };

  await fetchJson(url, {
    method: "POST",
    headers: headersOpenAI(apiKey),
    body: JSON.stringify(body)
  });

  return "OpenAI-compatible /responses";
}

async function probeOpenAICompletions(base, apiKey, model) {
  const url = `${openAIBase(base)}/completions`;

  const body = {
    model,
    prompt: "ping",
    max_tokens: 1,
    temperature: 0,
    stream: false
  };

  await fetchJson(url, {
    method: "POST",
    headers: headersOpenAI(apiKey),
    body: JSON.stringify(body)
  });

  return "OpenAI-compatible /completions";
}

async function probeOpenAIEmbeddings(base, apiKey, model) {
  const url = `${openAIBase(base)}/embeddings`;

  const body = {
    model,
    input: "ping"
  };

  await fetchJson(url, {
    method: "POST",
    headers: headersOpenAI(apiKey),
    body: JSON.stringify(body)
  });

  return "OpenAI-compatible /embeddings";
}

async function probeOllamaChat(base, model) {
  const url = `${baseNoV1(base)}/api/chat`;

  const body = {
    model,
    messages: [
      {
        role: "user",
        content: "ping"
      }
    ],
    stream: false,
    options: {
      num_predict: 1
    }
  };

  await fetchJson(url, {
    method: "POST",
    headers: headersOllama(),
    body: JSON.stringify(body)
  });

  return "Ollama /api/chat";
}

async function probeOllamaGenerate(base, model) {
  const url = `${baseNoV1(base)}/api/generate`;

  const body = {
    model,
    prompt: "ping",
    stream: false,
    options: {
      num_predict: 1
    }
  };

  await fetchJson(url, {
    method: "POST",
    headers: headersOllama(),
    body: JSON.stringify(body)
  });

  return "Ollama /api/generate";
}

async function probeAnthropicMessages(base, apiKey, model) {
  const url = `${openAIBase(base).replace(/\/v1$/i, "/v1")}/messages`;

  const body = {
    model,
    max_tokens: 1,
    messages: [
      {
        role: "user",
        content: "ping"
      }
    ]
  };

  await fetchJson(url, {
    method: "POST",
    headers: headersAnthropic(apiKey),
    body: JSON.stringify(body)
  });

  return "Anthropic /v1/messages";
}

async function probeGeminiGenerate(base, apiKey, model) {
  const gModel = model.replace(/^models\//i, "");
  const gBase = geminiBase(base);

  const url = apiKey
    ? `${gBase}/models/${gModel}:generateContent?key=${encodeURIComponent(apiKey)}`
    : `${gBase}/models/${gModel}:generateContent`;

  const body = {
    contents: [
      {
        parts: [
          {
            text: "ping"
          }
        ]
      }
    ],
    generationConfig: {
      maxOutputTokens: 1
    }
  };

  await fetchJson(url, {
    method: "POST",
    headers: headersGemini(apiKey),
    body: JSON.stringify(body)
  });

  return "Gemini generateContent";
}

function orderedProbes(candidate, base, apiKey) {
  const model = candidate.id;
  const source = candidate.source || "";

  const probes = [];
  const add = (name, fn) => probes.push({ name, fn });

  if (source.includes("ollama")) {
    add("ollama-chat", () => probeOllamaChat(base, model));
    add("ollama-generate", () => probeOllamaGenerate(base, model));
  }

  if (source.includes("gemini") || modelLooksGemini(model)) {
    add("gemini-generate", () => probeGeminiGenerate(base, apiKey, model));
  }

  if (source.includes("anthropic") || modelLooksClaude(model)) {
    add("anthropic-messages", () => probeAnthropicMessages(base, apiKey, model));
  }

  if (modelLooksEmbedding(model)) {
    add("openai-embeddings", () => probeOpenAIEmbeddings(base, apiKey, model));
  }

  add("openai-chat", () => probeOpenAIChat(base, apiKey, model));
  add("openai-responses", () => probeOpenAIResponses(base, apiKey, model));
  add("openai-completions", () => probeOpenAICompletions(base, apiKey, model));

  if (!source.includes("ollama")) {
    add("ollama-chat", () => probeOllamaChat(base, model));
    add("ollama-generate", () => probeOllamaGenerate(base, model));
  }

  return probes;
}

export async function probeCandidate({ apiUrl, apiKey, model, source }) {
  const normalizedApiUrl = normalizeUrl(apiUrl);
  assertSafeApiUrl(normalizedApiUrl);

  const candidate = {
    id: String(model || "").trim(),
    source: String(source || "候选模型")
  };

  if (!candidate.id) {
    throw new Error("model 不能为空");
  }

  const base = baseFromUrl(normalizedApiUrl);
  const errors = [];
  const probes = orderedProbes(candidate, base, String(apiKey || "").trim());

  for (const probe of probes) {
    try {
      const via = await probe.fn();

      return {
        id: candidate.id,
        status: "ok",
        via
      };
    } catch (err) {
      errors.push(`${probe.name}: ${err.message}`);
    }
  }

  return {
    id: candidate.id,
    status: "bad",
    error: errors.slice(0, 5).join("\n") || "验证失败"
  };
}
