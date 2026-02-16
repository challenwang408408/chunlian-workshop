"use client";

import { FormEvent, useMemo, useState } from "react";

type CoupletResult = {
  topLine: string;
  bottomLine: string;
  horizontal: string;
  explanation: string;
  styleTags: string[];
};

type ApiErrorPayload = {
  error?: string;
  requestId?: string;
};

const defaultForm = {
  theme: "新年开工",
  style: "喜庆",
  industry: "互联网",
  tone: "稳重",
  tabooWords: "",
};

export default function HomePage() {
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CoupletResult | null>(null);
  const [posterLoading, setPosterLoading] = useState(false);
  const [posterError, setPosterError] = useState<string | null>(null);
  const [posterSrc, setPosterSrc] = useState<string | null>(null);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => form.theme.trim().length > 0 && !loading && !posterLoading,
    [form.theme, loading, posterLoading],
  );
  const inputDisabled = loading || posterLoading;
  const canGeneratePoster = Boolean(result) && !loading && !posterLoading;
  const canCopyResult = Boolean(result) && !loading && !posterLoading && !copyLoading;
  const canDownloadPoster = Boolean(posterSrc) && !loading && !posterLoading;

  function buildUiError(payload: unknown, fallback: string): string {
    if (!payload || typeof payload !== "object") {
      return fallback;
    }

    const response = payload as ApiErrorPayload;
    const message = typeof response.error === "string" && response.error.length > 0 ? response.error : fallback;
    if (typeof response.requestId === "string" && response.requestId.length > 0) {
      return `${message}（请求编号：${response.requestId}）`;
    }

    return message;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setCopyMessage(null);

    try {
      const response = await fetch("/api/couplet/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const payload = (await response.json().catch(() => null)) as ApiErrorPayload | { data?: CoupletResult } | null;
      if (!response.ok) {
        throw new Error(buildUiError(payload, "生成失败，请稍后再试。"));
      }

      const nextResult =
        payload &&
        typeof payload === "object" &&
        "data" in payload &&
        payload.data &&
        typeof payload.data === "object"
          ? (payload.data as CoupletResult)
          : null;
      if (!nextResult) {
        throw new Error("生成结果解析失败，请稍后重试。");
      }

      setResult(nextResult);
      setPosterSrc(null);
      setPosterError(null);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "网络或服务异常，请稍后重试。";
      setError(message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function copyResult() {
    if (!result) return;
    setCopyLoading(true);
    setCopyMessage(null);

    const text = [
      `上联：${result.topLine}`,
      `下联：${result.bottomLine}`,
      `横批：${result.horizontal}`,
      `解释：${result.explanation}`,
      `风格标签：${result.styleTags.join("、")}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage("已复制到剪贴板。");
    } catch {
      setCopyMessage("复制失败，请手动长按文本后复制。");
    } finally {
      setCopyLoading(false);
    }
  }

  async function generatePoster() {
    if (!result) return;

    setPosterLoading(true);
    setPosterError(null);
    setCopyMessage(null);

    try {
      const response = await fetch("/api/couplet/poster", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          theme: form.theme,
          style: form.style,
          topLine: result.topLine,
          bottomLine: result.bottomLine,
          horizontal: result.horizontal,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | ApiErrorPayload
        | { data?: { imageBase64?: string; imageUrl?: string } }
        | null;
      if (!response.ok) {
        throw new Error(buildUiError(payload, "海报生成失败，请稍后重试。"));
      }

      const data =
        payload && typeof payload === "object" && "data" in payload && payload.data
          ? (payload.data as { imageBase64?: string; imageUrl?: string })
          : null;
      const imageBase64 = data?.imageBase64;
      const imageUrl = data?.imageUrl;
      if (typeof imageBase64 === "string" && imageBase64.length > 0) {
        setPosterSrc(`data:image/png;base64,${imageBase64}`);
      } else if (typeof imageUrl === "string" && imageUrl.length > 0) {
        setPosterSrc(imageUrl);
      } else {
        throw new Error("海报生成成功，但未返回图片，请稍后重试。");
      }
    } catch (posterGenerateError) {
      const message =
        posterGenerateError instanceof Error
          ? posterGenerateError.message
          : "海报生成失败，请检查网络后重试。";
      setPosterError(message);
    } finally {
      setPosterLoading(false);
    }
  }

  function downloadPoster() {
    if (!posterSrc) return;
    const link = document.createElement("a");
    link.href = posterSrc;
    link.download = `chunlian-poster-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <main className="page">
      <section className="panel">
        <h1>AI 春联工坊</h1>
        <p className="muted">M3：移动端体验、可观测与交付完善。</p>

        <form className="form" onSubmit={onSubmit}>
          <label>
            主题
            <input
              value={form.theme}
              onChange={(event) => setForm((prev) => ({ ...prev, theme: event.target.value }))}
              placeholder="如：蛇年大吉"
              disabled={inputDisabled}
              required
            />
          </label>

          <div className="row">
            <label>
              风格
              <input
                value={form.style}
                onChange={(event) => setForm((prev) => ({ ...prev, style: event.target.value }))}
                placeholder="喜庆/古典"
                disabled={inputDisabled}
              />
            </label>
            <label>
              行业
              <input
                value={form.industry}
                onChange={(event) => setForm((prev) => ({ ...prev, industry: event.target.value }))}
                placeholder="如：餐饮"
                disabled={inputDisabled}
              />
            </label>
          </div>

          <div className="row">
            <label>
              语气
              <input
                value={form.tone}
                onChange={(event) => setForm((prev) => ({ ...prev, tone: event.target.value }))}
                placeholder="如：大气"
                disabled={inputDisabled}
              />
            </label>
            <label>
              禁忌词（可选）
              <input
                value={form.tabooWords}
                onChange={(event) => setForm((prev) => ({ ...prev, tabooWords: event.target.value }))}
                placeholder="用逗号分隔"
                disabled={inputDisabled}
              />
            </label>
          </div>

          <button type="submit" disabled={!canSubmit}>
            {loading ? "春联生成中..." : "生成春联"}
          </button>
        </form>

        {loading ? <p className="hint">正在生成春联，请稍候...</p> : null}
        {error ? <p className="error">{error}</p> : null}

        {result ? (
          <article className="result">
            <h2>生成结果</h2>
            <p>
              <strong>上联：</strong>
              {result.topLine}
            </p>
            <p>
              <strong>下联：</strong>
              {result.bottomLine}
            </p>
            <p>
              <strong>横批：</strong>
              {result.horizontal}
            </p>
            <p>
              <strong>解释：</strong>
              {result.explanation}
            </p>
            <p>
              <strong>风格标签：</strong>
              {result.styleTags.join("、")}
            </p>
            <button type="button" className="secondary" onClick={copyResult} disabled={!canCopyResult}>
              {copyLoading ? "复制中..." : "复制结果"}
            </button>
            {copyMessage ? <p className="hint">{copyMessage}</p> : null}
            <div className="actions">
              <button type="button" className="secondary" onClick={generatePoster} disabled={!canGeneratePoster}>
                {posterLoading ? "海报生成中..." : "生成海报图"}
              </button>
              <button type="button" className="secondary" onClick={downloadPoster} disabled={!canDownloadPoster}>
                下载海报图
              </button>
            </div>
            {posterLoading ? <p className="hint">正在生成海报，请稍候...</p> : null}
            {posterError ? (
              <p className="error">海报生成失败：{posterError}</p>
            ) : null}
            {posterSrc ? (
              <div className="poster">
                <img src={posterSrc} alt="春联海报预览图" />
              </div>
            ) : null}
          </article>
        ) : null}
      </section>
    </main>
  );
}
