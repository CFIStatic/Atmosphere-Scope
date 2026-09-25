import { createId } from "./ids";
import type { Finding, FollowUpQuestion, ScopeItem, SketchDocument } from "./types";
import { evaluateSketch } from "./geometry";

export function buildQuestions(input: { findings: Finding[]; scopeItems: ScopeItem[]; sketch: SketchDocument }): FollowUpQuestion[] {
  const questions: FollowUpQuestion[] = [];
  const evaluation = evaluateSketch(
    input.sketch.geometry.rooms,
    input.sketch.geometry.dimensions,
    input.sketch.geometry.openings,
    input.sketch.ceilingHeights,
  );

  for (const gap of evaluation.missing) {
    questions.push({
      id: createId("q"),
      priority: /height|incomplete|connection/i.test(gap) ? 1 : 2,
      prompt: gap.startsWith("What") ? gap : `Resolve: ${gap}`,
      why: "Quantity and scale status depend on this measurement or connection. A single confirmed dimension does not scale the rest of the sketch.",
      dependsOn: { findingIds: [], scopeItemIds: input.scopeItems.map((item) => item.id), dimensionIds: input.sketch.geometry.dimensions.map((d) => d.id) },
      status: "open",
      answer: null,
      answerKind: null,
      answeredAt: null,
    });
  }

  for (const finding of input.findings) {
    if (finding.evidenceClass === "contradiction") {
      questions.push(q(1, `Narration and visuals disagree: ${finding.title}. Which account should the estimator rely on?`, "Scope stays unsupported while the contradiction is open.", [finding.id], []));
    }
    if (/stain|discolor/i.test(finding.title) && finding.evidenceClass === "observed_condition") {
      questions.push(q(1, `Was a leak source identified and addressed at ${finding.locationNote || "the stained area"}?`, "Staining alone does not justify dry-out or replacement. Inspection and cause determine whether any repair is included.", [finding.id], scopeIds(input.scopeItems, finding.id)));
    }
    if (/mold|microbial/i.test(`${finding.title} ${finding.narratorReport ?? ""}`)) {
      questions.push(q(1, "Is there a qualified test result for microbial growth, separate from how the surface looks?", "Video cannot authorize hazardous-material remediation.", [finding.id], []));
    }
    if (finding.evidenceClass === "insufficient_evidence") {
      questions.push(q(2, `What additional capture is needed for ${finding.locationNote || finding.title}?`, "The current footage does not support a finding or a quantity.", [finding.id], []));
    }
    if (/behind this finish|material/i.test(`${finding.requiredFollowUp ?? ""} ${finding.uncertainty ?? ""}`)) {
      questions.push(q(2, `What material is behind the finish at ${finding.locationNote}?`, "Assembly rebuild cannot be specified from the visible skin alone.", [finding.id], scopeIds(input.scopeItems, finding.id)));
    }
  }

  for (const item of input.scopeItems) {
    if (item.quantity.status === "unresolved" && item.scopeClass !== "excluded") {
      questions.push(q(1, `What area is actually affected for “${item.description}” in ${item.location}?`, "The line stays unresolved until a measured repair extent exists. Room area will not be substituted.", [], [item.id]));
    }
    if (item.scopeClass === "optional") {
      questions.push(q(3, `Is the customer requesting repair, replacement, or an optional upgrade at ${item.location}?`, "Desired outcomes stay optional until the customer confirms them as scope.", item.findingIds, [item.id]));
    }
  }

  const deduped: FollowUpQuestion[] = [];
  const seen = new Set<string>();
  for (const question of questions) {
    if (seen.has(question.prompt)) continue;
    seen.add(question.prompt);
    deduped.push(question);
  }
  return deduped.sort((a, b) => a.priority - b.priority);
}

function q(priority: number, prompt: string, why: string, findingIds: string[], scopeItemIds: string[]): FollowUpQuestion {
  return {
    id: createId("q"),
    priority,
    prompt,
    why,
    dependsOn: { findingIds, scopeItemIds, dimensionIds: [] },
    status: "open",
    answer: null,
    answerKind: null,
    answeredAt: null,
  };
}

function scopeIds(items: ScopeItem[], findingId: string): string[] {
  return items.filter((item) => item.findingIds.includes(findingId)).map((item) => item.id);
}

export function answerQuestion(question: FollowUpQuestion, answer: string, kind: FollowUpQuestion["answerKind"]): FollowUpQuestion {
  return { ...question, status: "answered", answer, answerKind: kind, answeredAt: new Date().toISOString() };
}
