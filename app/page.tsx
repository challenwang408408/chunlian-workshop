"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ---------- Types ---------- */

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

/* ---------- Loading messages ---------- */

const COUPLET_STAGES = [
  "正在唤醒 AI 灵感…",
  "构思上联与下联…",
  "斟酌每一个字词…",
  "精心打磨横批…",
  "即将完成，请稍候…",
];

const POSTER_STAGES = [
  "准备画布与素材…",
  "AI 正在绘制春联海报…",
  "添加传统装饰纹样…",
  "调整色彩与构图…",
  "精细渲染中，马上就好…",
];

/* ---------- useElapsed hook ---------- */

function useElapsed(active: boolean) {
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (active) {
      setSeconds(0);
      intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setSeconds(0);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active]);

  return seconds;
}

/* ---------- useStageMessages hook ---------- */

function useStageMessages(active: boolean, messages: string[]) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setIndex((prev) => Math.min(prev + 1, messages.length - 1));
    }, 5000);
    return () => clearInterval(interval);
  }, [active, messages.length]);

  return { message: messages[index] ?? messages[0], stageIndex: index, totalStages: messages.length };
}

/* ---------- Default form values ---------- */

const defaultForm = {
  theme: "",
  style: "喜庆",
  industry: "通用",
  tone: "大气",
  tabooWords: "",
};

/* ---------- Page component ---------- */

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

  const coupletElapsed = useElapsed(loading);
  const posterElapsed = useElapsed(posterLoading);
  const coupletStage = useStageMessages(loading, COUPLET_STAGES);
  const posterStage = useStageMessages(posterLoading, POSTER_STAGES);

  const canSubmit = useMemo(
    () => form.theme.trim().length > 0 && !loading && !posterLoading,
    [form.theme, loading, posterLoading],
  );
  const inputDisabled = loading || posterLoading;
  const canGeneratePoster = Boolean(result) && !loading && !posterLoading;
  const canCopyResult = Boolean(result) && !loading && !posterLoading && !copyLoading;
  const canDownloadPoster = Boolean(posterSrc) && !loading && !posterLoading;

  const resultRef = useRef<HTMLDivElement>(null);

  function buildUiError(payload: unknown, fallback: string): string {
    if (!payload || typeof payload !== "object") return fallback;
    const response = payload as ApiErrorPayload;
    const message = typeof response.error === "string" && response.error.length > 0 ? response.error : fallback;
    if (typeof response.requestId === "string" && response.requestId.length > 0) {
      return `${message}（请求编号：${response.requestId}）`;
    }
    return message;
  }

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setLoading(true);
      setError(null);
      setCopyMessage(null);

      try {
        const response = await fetch("/api/couplet/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });

        const payload = (await response.json().catch(() => null)) as
          | ApiErrorPayload
          | { data?: CoupletResult }
          | null;
        if (!response.ok) {
          throw new Error(buildUiError(payload, "生成失败，请稍后再试。"));
        }

        const nextResult =
          payload && typeof payload === "object" && "data" in payload && payload.data && typeof payload.data === "object"
            ? (payload.data as CoupletResult)
            : null;
        if (!nextResult) throw new Error("生成结果解析失败，请稍后重试。");

        setResult(nextResult);
        setPosterSrc(null);
        setPosterError(null);
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      } catch (submitError) {
        const message = submitError instanceof Error ? submitError.message : "网络或服务异常，请稍后重试。";
        setError(message);
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [form],
  );

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
      setCopyMessage("已复制到剪贴板 ✓");
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
        headers: { "Content-Type": "application/json" },
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
        posterGenerateError instanceof Error ? posterGenerateError.message : "海报生成失败，请检查网络后重试。";
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

  /* ---------- Render helpers ---------- */

  function renderLoadingOverlay(
    elapsed: number,
    stage: { message: string; stageIndex: number; totalStages: number },
    emoji: string,
  ) {
    const progress = Math.min(((stage.stageIndex + 1) / stage.totalStages) * 85 + (elapsed % 4) * 2, 96);
    return (
      <div className="loading-overlay">
        <div className="loading-lantern">{emoji}</div>
        <div className="loading-message">{stage.message}</div>
        <div className="loading-stages">
          {Array.from({ length: stage.totalStages }).map((_, i) => (
            <span
              key={i}
              className={`stage-dot${i === stage.stageIndex ? " active" : ""}${i < stage.stageIndex ? " done" : ""}`}
            />
          ))}
        </div>
        <div className="loading-bar">
          <div className="loading-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="loading-timer">已等待 {elapsed} 秒</div>
      </div>
    );
  }

  /* ---------- Render ---------- */

  return (
    <main className="page">
      {/* Header */}
      <header className="header">
        <div className="header-lanterns">
          <span className="lantern">🏮</span>
          <span className="lantern">🏮</span>
          <span className="lantern">🏮</span>
        </div>
        <h1>AI 春联工坊</h1>
        <p className="header-sub">✦ 输入主题 · AI 即刻挥毫 · 一键生成春联海报 ✦</p>
      </header>

      <div className="divider">
        <span className="divider-icon">◈</span>
      </div>

      {/* Form panel */}
      <section className="panel">
        <h2 className="panel-title">创作你的专属春联</h2>

        <form className="form" onSubmit={onSubmit}>
          <div className="field">
            <span className="field-label">
              <span className="icon">🎯</span> 主题
            </span>
            <input
              className="field-input"
              value={form.theme}
              onChange={(e) => setForm((prev) => ({ ...prev, theme: e.target.value }))}
              placeholder="如：蛇年大吉、新年开工、龙腾虎跃"
              disabled={inputDisabled}
              required
            />
          </div>

          <div className="form-row">
            <div className="field">
              <span className="field-label">
                <span className="icon">🎨</span> 风格
              </span>
              <input
                className="field-input"
                value={form.style}
                onChange={(e) => setForm((prev) => ({ ...prev, style: e.target.value }))}
                placeholder="喜庆 / 古典 / 诙谐"
                disabled={inputDisabled}
              />
            </div>
            <div className="field">
              <span className="field-label">
                <span className="icon">🏢</span> 行业
              </span>
              <input
                className="field-input"
                value={form.industry}
                onChange={(e) => setForm((prev) => ({ ...prev, industry: e.target.value }))}
                placeholder="通用 / 餐饮 / 科技"
                disabled={inputDisabled}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <span className="field-label">
                <span className="icon">🎙️</span> 语气
              </span>
              <input
                className="field-input"
                value={form.tone}
                onChange={(e) => setForm((prev) => ({ ...prev, tone: e.target.value }))}
                placeholder="大气 / 温馨 / 幽默"
                disabled={inputDisabled}
              />
            </div>
            <div className="field">
              <span className="field-label">
                <span className="icon">🚫</span> 禁忌词
              </span>
              <input
                className="field-input"
                value={form.tabooWords}
                onChange={(e) => setForm((prev) => ({ ...prev, tabooWords: e.target.value }))}
                placeholder="逗号分隔（可选）"
                disabled={inputDisabled}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
            {loading ? "🖊️ 春联生成中…" : "🧧 开始生成春联"}
          </button>
        </form>

        {/* Couplet loading */}
        {loading && renderLoadingOverlay(coupletElapsed, coupletStage, "🏮")}

        {/* Error */}
        {error && <div className="error-msg">{error}</div>}

        {/* ---- Result ---- */}
        {result && (
          <div className="result-section" ref={resultRef}>
            <div className="scroll-container">
              {/* 横批 */}
              <div className="scroll-top">
                <div className="horizontal-banner">{result.horizontal}</div>
              </div>

              <div className="scroll-body">
                {/* 上联 */}
                <div className="couplet-line">
                  <span className="couplet-label">上联</span>
                  <span className="couplet-text">{result.topLine}</span>
                </div>

                {/* 下联 */}
                <div className="couplet-line">
                  <span className="couplet-label">下联</span>
                  <span className="couplet-text">{result.bottomLine}</span>
                </div>

                {/* 解释 */}
                <div className="explanation">
                  <div className="explanation-title">📖 寓意解读</div>
                  <div className="explanation-text">{result.explanation}</div>
                </div>

                {/* 风格标签 */}
                <div className="tags">
                  {result.styleTags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="scroll-actions">
                <button type="button" className="btn btn-secondary" onClick={copyResult} disabled={!canCopyResult}>
                  {copyLoading ? "复制中…" : "📋 复制结果"}
                </button>
                <button type="button" className="btn btn-gold" onClick={generatePoster} disabled={!canGeneratePoster}>
                  {posterLoading ? "🎨 海报生成中…" : "🎨 生成海报图"}
                </button>
                <button type="button" className="btn btn-secondary" onClick={downloadPoster} disabled={!canDownloadPoster}>
                  📥 下载海报
                </button>
              </div>
            </div>

            {/* Copy toast */}
            {copyMessage && <div className="toast">{copyMessage}</div>}

            {/* Poster loading */}
            {posterLoading && renderLoadingOverlay(posterElapsed, posterStage, "🎨")}

            {/* Poster error */}
            {posterError && <div className="error-msg">{posterError}</div>}

            {/* Poster display */}
            {posterSrc && (
              <div className="poster-wrapper">
                <img src={posterSrc} alt="春联海报预览图" />
              </div>
            )}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="footer">
        <p>AI 春联工坊 · 用 AI 传承年味 ·{" "}
          <a href="https://challenwang.com" target="_blank" rel="noopener noreferrer">
            challenwang.com
          </a>
        </p>
      </footer>
    </main>
  );
}
