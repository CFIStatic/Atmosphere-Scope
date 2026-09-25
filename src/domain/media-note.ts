export const SAMPLE_MEDIA_NOTE = "Sample clip. No binary video is shipped; transcript and frame notes are the evidence.";

export function visibleMediaNote(note: string | null | undefined): string {
  const text = note?.trim() ?? "";
  if (!text || text === SAMPLE_MEDIA_NOTE) return "";
  return text;
}
