export type GenerateCoupletRequest = {
  theme: string;
  style: string;
  industry: string;
  tone: string;
  tabooWords?: string[];
};

export type CoupletResult = {
  topLine: string;
  bottomLine: string;
  horizontal: string;
  explanation: string;
  styleTags: string[];
};

type ParseResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTabooWords(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value
      .map((item) => asTrimmedString(item))
      .filter((item) => item.length > 0)
      .slice(0, 20);
  }

  if (typeof value === "string") {
    const list = value
      .split(/[，,、]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 20);
    return list.length > 0 ? list : undefined;
  }

  return undefined;
}

export function parseGenerateRequest(payload: unknown): ParseResult<GenerateCoupletRequest> {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "请求体必须为 JSON 对象" };
  }

  const body = payload as Record<string, unknown>;
  const theme = asTrimmedString(body.theme);
  const style = asTrimmedString(body.style) || "喜庆";
  const industry = asTrimmedString(body.industry) || "通用";
  const tone = asTrimmedString(body.tone) || "吉祥";
  const tabooWords = normalizeTabooWords(body.tabooWords);

  if (!theme) {
    return { ok: false, error: "theme 不能为空" };
  }

  if (theme.length > 50) {
    return { ok: false, error: "theme 过长，请控制在 50 字以内" };
  }

  return {
    ok: true,
    data: {
      theme,
      style,
      industry,
      tone,
      tabooWords,
    },
  };
}

export function parseModelCoupletOutput(raw: string): ParseResult<CoupletResult> {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const topLine = asTrimmedString(parsed.topLine);
    const bottomLine = asTrimmedString(parsed.bottomLine);
    const horizontal = asTrimmedString(parsed.horizontal);
    const explanation = asTrimmedString(parsed.explanation);

    const styleTags = Array.isArray(parsed.styleTags)
      ? parsed.styleTags.map((item) => asTrimmedString(item)).filter((item) => item.length > 0)
      : [];

    if (!topLine || !bottomLine || !horizontal || !explanation) {
      return { ok: false, error: "模型返回字段不完整" };
    }

    return {
      ok: true,
      data: {
        topLine,
        bottomLine,
        horizontal,
        explanation,
        styleTags,
      },
    };
  } catch {
    return { ok: false, error: "模型返回不是合法 JSON" };
  }
}
