import { z } from "zod";
import type { FrameObservation, MediaAsset, TranscriptSegment } from "@/domain/types";

/**
 * Replaceable integration boundary.
 * A future Atmosphere deployment can supply ASR, vision, and wording providers.
 * Providers return evidence. They do not set prices, approvals, or authorizations.
 */
export interface TranscriptionProvider {
  id: string;
  transcribe(media: MediaAsset, suppliedText?: string): Promise<TranscriptSegment[]>;
}

export interface FrameAnalysisProvider {
  id: string;
  analyze(media: MediaAsset): Promise<FrameObservation[]>;
}

export const modelFindingSchema = z.object({
  roomName: z.string().min(1),
  evidenceClass: z.enum(["observed_condition", "reported_condition", "suspected_cause", "insufficient_evidence", "no_visible_issue", "contradiction"]),
  title: z.string().min(1),
  observableCondition: z.string().nullable(),
  narratorReport: z.string().nullable(),
  interpretation: z.string().nullable(),
  uncertainty: z.string().nullable(),
  mediaId: z.string().optional(),
  startMs: z.number().optional(),
});

export const modelOutputSchema = z.object({
  findings: z.array(modelFindingSchema),
});

export type AcceptedModelFinding = z.infer<typeof modelFindingSchema>;

/** Drop fields a model must never own: prices, approvals, invented confirmed measurements. */
export function acceptModelOutput(raw: unknown): { findings: AcceptedModelFinding[]; rejected: string[] } {
  const parsed = modelOutputSchema.safeParse(raw);
  if (!parsed.success) return { findings: [], rejected: ["Model output failed validation and was discarded."] };
  const rejected: string[] = [];
  const findings = parsed.data.findings.filter((finding) => {
    const blob = JSON.stringify(finding);
    if (/approve|authoriz|unit price|markup|ignore previous/i.test(blob)) {
      rejected.push(`Rejected finding “${finding.title}” because it tried to set price, approval, or instructions.`);
      return false;
    }
    return true;
  });
  return { findings, rejected };
}

export class UnavailableTranscriptionProvider implements TranscriptionProvider {
  id = "unavailable-transcription";
  async transcribe(media: MediaAsset, suppliedText?: string): Promise<TranscriptSegment[]> {
    if (!suppliedText?.trim()) return [];
    return [{
      id: `tx_${media.id}`,
      mediaId: media.id,
      startMs: 0,
      endMs: media.durationMs ?? 0,
      text: suppliedText,
      speaker: "narrator",
      injectionFlags: [],
      source: "user_supplied",
    }];
  }
}

export class UnavailableFrameProvider implements FrameAnalysisProvider {
  id = "unavailable-frames";
  async analyze(): Promise<FrameObservation[]> {
    return [];
  }
}
