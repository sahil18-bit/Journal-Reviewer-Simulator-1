import type { ReviewResult } from "./api";

/** Saved reports live only in this browser. Manuscript text is never stored. */
export interface Saved { key: string; title: string; date: string; result: ReviewResult; done: string[] }
const K = "jrs.history.v1";

export function loadHistory(): Saved[] {
  try { return JSON.parse(localStorage.getItem(K) ?? "[]"); } catch { return []; }
}
export function saveHistory(list: Saved[]) {
  try { localStorage.setItem(K, JSON.stringify(list.slice(0, 20))); } catch { /* storage full or blocked */ }
}
