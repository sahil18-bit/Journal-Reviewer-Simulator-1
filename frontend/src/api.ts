/** API client for the FastAPI review simulator. */
export type Severity = "major" | "minor";
export type Recommendation = "accept" | "minor_revision" | "major_revision" | "reject";

export interface Comment { id: string; severity: Severity; section: string; quote?: string; text: string }
export interface Reviewer {
  id: string; name: string; focus: string; recommendation: Recommendation;
  summary: string; strengths: string[]; comments: Comment[];
}
export interface ReviewResult {
  id: string; status: "pending" | "running" | "done" | "failed";
  decision?: Recommendation; reviewers: Reviewer[]; simulated?: boolean;
}
export interface ReviewRequest { file: File | null; text: string; journal: string; reviewers: number; strictness: string; panel: string }

export class ApiError extends Error {
  constructor(message: string, public code = "unknown", public requestId?: string) { super(message); }
}

const API_ORIGIN = (
  import.meta.env.VITE_API_BASE_URL ?? ""
).replace(/\/$/, "");

const BASE = `${API_ORIGIN}/api/v1`;

async function parse<T>(res: Response): Promise<T> {
  if (res.ok) return res.json();
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON error */ }
  const e = body?.error;
  throw new ApiError(e?.message ?? `Request failed (${res.status})`, e?.code ?? `http_${res.status}`, e?.request_id);
}

export async function checkHealth(): Promise<boolean> {
  try { return (await fetch(`${BASE}/health`)).ok; } catch { return false; }
}

export async function submitReview(req: ReviewRequest): Promise<{ id: string }> {
  const form = new FormData();
  if (req.file) form.append("file", req.file); else form.append("text", req.text);
  form.append("journal", req.journal);
  form.append("reviewers", String(req.reviewers));
  form.append("strictness", req.strictness);
  form.append("panel", req.panel);
  return parse(await fetch(`${BASE}/reviews`, { method: "POST", body: form }));
}

export async function getReview(id: string): Promise<ReviewResult> {
  return parse(await fetch(`${BASE}/reviews/${id}`));
}

