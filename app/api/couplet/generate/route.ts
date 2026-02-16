import { NextResponse } from "next/server";
import {
  parseGenerateRequest,
  parseModelCoupletOutput,
  type GenerateCoupletRequest,
} from "@/lib/couplet-schema";
import {
  fetchWithTimeout,
  isAbortError,
  logApiResult,
  resolveTimeoutMs,
} from "@/lib/api-observability";

const AI_BUILDER_URL = "https://space.ai-builders.com/backend/v1/chat/completions";
const DEFAULT_MODEL = process.env.AI_BUILDER_MODEL ?? "supermind-agent-v1";
const REQUEST_TIMEOUT_MS = resolveTimeoutMs(process.env.AI_BUILDER_TIMEOUT_MS);

function buildUserPrompt(input: GenerateCoupletRequest): string {
  return [
    `主题：${input.theme}`,
    `风格：${input.style}`,
    `行业：${input.industry}`,
    `语气：${input.tone}`,
    `禁忌词：${input.tabooWords?.join("、") ?? "无"}`,
    "请严格输出 JSON，不要输出 markdown 代码块，不要额外说明。",
    "JSON schema: { topLine: string, bottomLine: string, horizontal: string, explanation: string, styleTags: string[] }",
  ].join("\n");
}

function extractJson(raw: string): string {
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }
  return raw.trim();
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

  const parsedRequest = parseGenerateRequest(await request.json().catch(() => null));
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
      AI_BUILDER_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          temperature: 0.8,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "你是资深春联撰写助手。输出时仅返回 JSON，要求语言工整、吉祥，避免低俗内容。",
            },
            {
              role: "user",
              content: buildUserPrompt(parsedRequest.data),
            },
          ],
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
          error: `上游服务暂时不可用（HTTP ${upstreamResponse.status}）。请稍后重试。`,
        },
        { status: 502 },
      );
    }

    const content =
      (upstreamPayload as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message
        ?.content ?? "";

    if (!content) {
      finish(502, "UpstreamEmptyContent");
      return NextResponse.json({ requestId, error: "生成结果为空，请稍后重试。" }, { status: 502 });
    }

    const parsedModel = parseModelCoupletOutput(extractJson(content));
    if (!parsedModel.ok) {
      finish(502, "ModelOutputParseError");
      return NextResponse.json({ requestId, error: `${parsedModel.error}，请稍后重试。` }, { status: 502 });
    }

    finish(200);
    return NextResponse.json(
      {
        requestId,
        data: parsedModel.data,
        provider: "ai-builder",
        model: DEFAULT_MODEL,
      },
      { status: 200 },
    );
  } catch (error) {
    if (isAbortError(error)) {
      finish(504, "UpstreamTimeout");
      return NextResponse.json(
        {
          requestId,
          error: `生成请求超时（>${Math.floor(REQUEST_TIMEOUT_MS / 1000)} 秒），请稍后重试。`,
        },
        { status: 504 },
      );
    }

    finish(502, "NetworkOrServiceError");
    return NextResponse.json(
      { requestId, error: "调用上游服务失败，请检查网络后重试。" },
      { status: 502 },
    );
  }
}
