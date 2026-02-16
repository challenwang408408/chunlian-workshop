import { NextResponse } from "next/server";
import {
  fetchWithTimeout,
  isAbortError,
  logApiResult,
  resolveTimeoutMs,
} from "@/lib/api-observability";

const AI_BUILDER_IMAGE_URL = "https://space.ai-builders.com/backend/v1/images/generations";
const DEFAULT_IMAGE_MODEL = process.env.AI_BUILDER_IMAGE_MODEL ?? "gpt-image-1.5";
const REQUEST_TIMEOUT_MS = resolveTimeoutMs(process.env.AI_BUILDER_TIMEOUT_MS);

type PosterRequest = {
  theme: string;
  style?: string;
  topLine: string;
  bottomLine: string;
  horizontal: string;
};

function parsePosterRequest(payload: unknown): { ok: true; data: PosterRequest } | { ok: false; error: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "请求体必须是 JSON 对象" };
  }

  const raw = payload as Record<string, unknown>;
  const requiredFields = ["theme", "topLine", "bottomLine", "horizontal"] as const;
  for (const field of requiredFields) {
    if (typeof raw[field] !== "string" || raw[field].trim().length === 0) {
      return { ok: false, error: `${field} 不能为空` };
    }
  }

  const data: PosterRequest = {
    theme: String(raw.theme).trim(),
    style: typeof raw.style === "string" ? raw.style.trim() : undefined,
    topLine: String(raw.topLine).trim(),
    bottomLine: String(raw.bottomLine).trim(),
    horizontal: String(raw.horizontal).trim(),
  };

  return { ok: true, data };
}

function buildPrompt(input: PosterRequest): string {
  return [
    "请生成一张中国春节对联主题海报（竖版 2:3 比例）。",
    `主题：${input.theme}`,
    `风格：${input.style && input.style.length > 0 ? input.style : "喜庆、年味、国风"}`,
    `横批：${input.horizontal}`,
    `上联：${input.topLine}`,
    `下联：${input.bottomLine}`,
    "布局要求：",
    "- 横批位于画面上方居中位置，距离顶部边缘留有充足的装饰空白，确保横批文字完整显示不被裁切。",
    "- 上联在画面右侧竖排书写，下联在画面左侧竖排书写，符合传统对联从右到左的阅读顺序。",
    "- 所有文字（横批、上联、下联）必须完整处于画面安全区域内，距离图片四边至少保留 8% 的边距。",
    "画面要求：红金主色调，传统中国风装饰纹样，文字清晰可读，适合社交分享封面。",
  ].join("\n");
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const finish = (statusCode: number, errorType: string | null = null) => {
    logApiResult({
      requestId,
      durationMs: Date.now() - startedAt,
      statusCode,
      errorType,
    });
  };

  const parsedRequest = parsePosterRequest(await request.json().catch(() => null));
  if (!parsedRequest.ok) {
    finish(400, "ValidationError");
    return NextResponse.json(
      { requestId, error: `请求参数有误：${parsedRequest.error}。请检查后重试。` },
      { status: 400 },
    );
  }

  const token = process.env.AI_BUILDER_TOKEN;
  if (!token) {
    finish(500, "ServerConfigError");
    return NextResponse.json(
      { requestId, error: "服务暂时不可用（配置缺失）。请联系管理员后重试。" },
      { status: 500 },
    );
  }

  try {
    const upstreamResponse = await fetchWithTimeout(
      AI_BUILDER_IMAGE_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          model: DEFAULT_IMAGE_MODEL,
          prompt: buildPrompt(parsedRequest.data),
          size: "1024x1536",
        }),
      },
      REQUEST_TIMEOUT_MS,
    );

    const upstreamPayload = await upstreamResponse.json().catch(() => null);
    if (!upstreamResponse.ok) {
      finish(502, "UpstreamError");
      return NextResponse.json(
        {
          requestId,
          error: `海报服务暂时不可用（HTTP ${upstreamResponse.status}）。请稍后重试。`,
        },
        { status: 502 },
      );
    }

    const firstImage = (upstreamPayload as { data?: Array<{ b64_json?: string; url?: string }> })?.data?.[0];
    const imageBase64 = firstImage?.b64_json;
    const imageUrl = firstImage?.url;

    if (!imageBase64 && !imageUrl) {
      finish(502, "UpstreamEmptyImage");
      return NextResponse.json({ requestId, error: "海报生成结果为空，请稍后重试。" }, { status: 502 });
    }

    finish(200);
    return NextResponse.json(
      {
        requestId,
        data: {
          imageBase64,
          imageUrl,
        },
        provider: "ai-builder",
        model: DEFAULT_IMAGE_MODEL,
      },
      { status: 200 },
    );
  } catch (error) {
    if (isAbortError(error)) {
      finish(504, "UpstreamTimeout");
      return NextResponse.json(
        {
          requestId,
          error: `海报生成超时（>${Math.floor(REQUEST_TIMEOUT_MS / 1000)} 秒），请稍后重试。`,
        },
        { status: 504 },
      );
    }

    finish(502, "NetworkOrServiceError");
    return NextResponse.json(
      { requestId, error: "调用海报服务失败，请检查网络后重试。" },
      { status: 502 },
    );
  }
}
