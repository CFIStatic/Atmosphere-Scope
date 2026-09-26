/**
 * Answer a question about one clip from the transcript already on file.
 * Adapted from Atmosphere `backend/src/shared/clipAsk.ts` (commit a9e2680).
 * Scope does not call a second model here. If the quote is not verbatim, the
 * answer is that the clip does not say it.
 */

import { parseVerbatimTranscript } from "./verbatim-transcript";

export type ClipAnswer = { grounded: boolean; answer: string; quote: string | null; tSec: number | null };

export function answerClipQuestion(question: string, transcript: string): ClipAnswer {
  if (/price|\$|approve the estimate|ignore previous/i.test(question)) {
    return { grounded: false, answer: "That question is not answered from the clip. Narration cannot set a price or an approval.", quote: null, tSec: null };
  }
  const segments = parseVerbatimTranscript(transcript);
  const needle = question.toLowerCase().split(/\W+/).filter((word) => word.length > 3);
  const hit = segments.find((segment) => {
    const text = segment.text.toLowerCase();
    return needle.some((word) => text.includes(word));
  });
  if (!hit || !transcript.includes(hit.text)) {
    return { grounded: false, answer: "The clip does not say. No answer was invented.", quote: null, tSec: null };
  }
  return { grounded: true, answer: hit.text, quote: hit.text, tSec: hit.tSec };
}
