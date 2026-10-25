import { useEffect, useRef, useState } from "react";
import {
  ApiError, checkHealth, getReview, submitReview,
  type Recommendation, type ReviewResult,
} from "./api";
import { loadHistory, saveHistory, type Saved } from "./storage";
import { download, toMarkdown } from "./exportReport";

const MAX_MB = 20;
const ACCEPT = ".pdf,.docx,.txt";
const LABEL: Record<Recommendation, string> = {
  accept: "Accept", minor_revision: "Minor revision", major_revision: "Major revision", reject: "Reject",
};
const PANELS = [
  ["general", "General"], ["methods", "Methods and statistics"],
  ["clinical", "Clinical and ethics"], ["theory", "Theory and novelty"],
];
const STAGES = ["Reading the manuscript", "Reviewers are drafting reports", "Editor is weighing the reports"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function App() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [journal, setJournal] = useState("");
  const [reviewers, setReviewers] = useState(3);
  const [strictness, setStrictness] = useState("standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [active, setActive] = useState(0);
  const [panel, setPanel] = useState("general");
  const [stage, setStage] = useState(0);
  const [history, setHistory] = useState<Saved[]>(loadHistory);
  const [current, setCurrent] = useState<Saved | null>(null);
  const [filter, setFilter] = useState<"all" | "major" | "minor">("all");
  const input = useRef<HTMLInputElement>(null);

  const persist = (list: Saved[]) => { setHistory(list); saveHistory(list); };
  const title = file?.name ?? (journal ? `Manuscript for ${journal}` : "Pasted manuscript");

  function open(saved: Saved) { setCurrent(saved); setResult(saved.result); setActive(0); setFilter("all"); }
  function toggleDone(id: string) {
    if (!current) return;
    const done = current.done.includes(id) ? current.done.filter((d) => d !== id) : [...current.done, id];
    const next = { ...current, done };
    setCurrent(next);
    persist(history.map((h) => (h.key === next.key ? next : h)));
  }
  function finish(r: ReviewResult) {
    const saved: Saved = { key: `${Date.now()}`, title, date: new Date().toISOString(), result: r, done: [] };
    persist([saved, ...history]);
    open(saved);
  }

  useEffect(() => { checkHealth().then(setOnline); }, []);

  const pick = (f: File | null) => {
    setError(null);
    if (f && f.size > MAX_MB * 1024 * 1024) return setError(`That file is over ${MAX_MB} MB. Upload a smaller file or paste the text.`);
    setFile(f);
  };

  const canRun = !busy && (!!file || text.trim().length > 200);

  async function run() {
    setBusy(true); setError(null); setResult(null); setActive(0); setStage(0);
    try {
      const { id } = await submitReview({ file, text, journal, reviewers, strictness, panel });
      for (let i = 0; i < 120; i++) {
        const r = await getReview(id);
        setStage(Math.min(i + 1, STAGES.length - 1));
        if (r.status === "done") { finish(r); break; }
        if (r.status === "failed") throw new ApiError("The review could not be completed. Try again.");
        await sleep(2000);
      }
    } catch (e) {
      setError(e instanceof ApiError ? `${e.message}${e.requestId ? ` (ref ${e.requestId})` : ""}` : "Could not reach the API. Check that the backend is running and try again.");
    } finally { setBusy(false); }
  }

  const reset = () => { setResult(null); setCurrent(null); setFile(null); setText(""); };
  const rev = result?.reviewers[active];
  const done = current?.done ?? [];
  const allComments = result?.reviewers.flatMap((r) => r.comments) ?? [];
  const addressed = allComments.filter((c) => done.includes(c.id)).length;

  return (
    <div className="shell">
      <header className="top">
        <h1>Journal Reviewer Simulator</h1>
        <span className={`status ${online ? "up" : online === false ? "down" : ""}`} role="status">
          {online === null ? "Checking API" : online ? "API connected" : "API offline"}
        </span>
      </header>

      {!result ? (
        <main className="submit">
          <section className="intro">
            <h2>Find the weak points before a reviewer does</h2>
            <p>Upload a manuscript and get simulated referee reports with the major and minor concerns a journal is likely to raise.</p>
            <p className="note">Your manuscript is treated as untrusted data and is not stored by this interface.</p>
          </section>

          <section className="panel" aria-busy={busy}>
            <div
              className={`drop ${file ? "has" : ""}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0] ?? null); }}
            >
              <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => pick(e.target.files?.[0] ?? null)} />
              {file ? (
                <p><strong>{file.name}</strong> <button className="link" onClick={() => { setFile(null); if (input.current) input.current.value = ""; }}>Remove</button></p>
              ) : (
                <p>Drop a PDF, DOCX or TXT here, or <button className="link" onClick={() => input.current?.click()}>choose a file</button></p>
              )}
            </div>

            {!file && (
              <label className="field">
                <span>Or paste the manuscript text</span>
                <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste at least a full abstract and methods section" />
              </label>
            )}

            <div className="row">
              <label className="field grow">
                <span>Target journal (optional)</span>
                <input value={journal} onChange={(e) => setJournal(e.target.value)} placeholder="e.g. Journal of Applied Ecology" />
              </label>
              <label className="field">
                <span>Reviewers</span>
                <select value={reviewers} onChange={(e) => setReviewers(+e.target.value)}>
                  <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
                </select>
              </label>
              <label className="field">
                <span>Strictness</span>
                <select value={strictness} onChange={(e) => setStrictness(e.target.value)}>
                  <option value="lenient">Lenient</option><option value="standard">Standard</option><option value="harsh">Harsh</option>
                </select>
              </label>
            </div>

            <fieldset className="panels">
              <legend>Reviewer panel</legend>
              {PANELS.map(([v, l]) => (
                <label key={v} className={panel === v ? "on" : ""}>
                  <input type="radio" name="panel" checked={panel === v} onChange={() => setPanel(v)} />{l}
                </label>
              ))}
            </fieldset>

            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary" disabled={!canRun} onClick={run}>{busy ? STAGES[stage] + "…" : "Run review"}</button>
          </section>

          {history.length > 0 && (
            <section className="history">
              <div className="hrow"><h3>Recent reviews</h3>
                <button className="link" onClick={() => persist([])}>Clear history</button></div>
              <ul>
                {history.map((h) => (
                  <li key={h.key}>
                    <button onClick={() => open(h)}>
                      <span>{h.title}</span>
                      <small>{new Date(h.date).toLocaleDateString()} · {h.result.decision ? LABEL[h.result.decision] : ""}</small>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="note">Saved in this browser only. Manuscript text is not stored.</p>
            </section>
          )}
        </main>
      ) : (
        <main className="report">
          {result.simulated && (
            <p className="demo" role="note">
              Simulated review: this checklist was generated from your submitted text using simple rules. It is not expert peer review and does not verify scientific claims, data, or citations.
            </p>
          )}
          <div className="verdict">
            <div>
              <p className="muted">Editor's decision</p>
              <h2 className={result.decision}>{result.decision ? LABEL[result.decision] : "—"}</h2>
            </div>
            <div className="actions">
              <button onClick={() => download("review.md", toMarkdown(current?.title ?? title, result, done))}>Download .md</button>
              <button onClick={() => window.print()}>Print</button>
              <button onClick={reset}>New review</button>
            </div>
          </div>

          <div className="tabs" role="tablist">
            {result.reviewers.map((r, i) => (
              <button key={r.id} role="tab" aria-selected={i === active} className={i === active ? "on" : ""} onClick={() => setActive(i)}>
                {r.name}<small>{LABEL[r.recommendation]}</small>
              </button>
            ))}
          </div>

          <div className="bar">
            <p>{addressed} of {allComments.length} concerns addressed</p>
            <progress value={addressed} max={Math.max(allComments.length, 1)} />
            <div className="seg" role="group" aria-label="Filter concerns">
              {(["all", "major", "minor"] as const).map((f) => (
                <button key={f} aria-pressed={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                  {f === "all" ? "All" : f === "major" ? "Major" : "Minor"}
                </button>
              ))}
            </div>
          </div>

          {rev && (
            <article className="paper" role="tabpanel">
              <p className="muted">{rev.focus}</p>
              <p className="lead">{rev.summary}</p>

              <h3>Strengths</h3>
              <ul>{rev.strengths.map((s) => <li key={s}>{s}</li>)}</ul>

              <h3>Concerns</h3>
              {(["major", "minor"] as const).map((sev) => {
                const items = rev.comments.filter((c) => c.severity === sev && (filter === "all" || filter === sev));
                if (!items.length) return null;
                return (
                  <section key={sev}>
                    <h4>{sev === "major" ? "Major" : "Minor"} ({items.length})</h4>
                    {items.map((c) => (
                      <div key={c.id} className={`note-card ${c.severity} ${done.includes(c.id) ? "done" : ""}`}>
                        <label className="check">
                          <input type="checkbox" checked={done.includes(c.id)} onChange={() => toggleDone(c.id)} />
                          Addressed
                        </label>
                        <p className="where">{c.section}</p>
                        {c.quote && <blockquote>{c.quote}</blockquote>}
                        <p>{c.text}</p>
                      </div>
                    ))}
                  </section>
                );
              })}
            </article>
          )}
        </main>
      )}
    </div>
  );
}
