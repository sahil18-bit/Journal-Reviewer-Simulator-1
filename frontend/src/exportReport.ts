import type { Recommendation, ReviewResult } from "./api";

const LABEL: Record<Recommendation, string> = {
  accept: "Accept", minor_revision: "Minor revision", major_revision: "Major revision", reject: "Reject",
};

export function toMarkdown(title: string, r: ReviewResult, done: string[]): string {
  const out = [`# Simulated review: ${title}`, ""];
  if (r.simulated) out.push("> Rule-based simulated checklist only; not expert peer review or verification of scientific claims.", "");
  if (r.decision) out.push(`**Decision:** ${LABEL[r.decision]}`, "");
  for (const rv of r.reviewers) {
    out.push(`## ${rv.name} (${rv.focus}): ${LABEL[rv.recommendation]}`, "", rv.summary, "", "### Strengths");
    rv.strengths.forEach((s) => out.push(`- ${s}`));
    out.push("", "### Concerns");
    rv.comments.forEach((c) => {
      out.push(`- [${done.includes(c.id) ? "x" : " "}] **${c.severity}**, ${c.section}: ${c.text}`);
    });
    out.push("");
  }
  return out.join("\n");
}

export function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}
