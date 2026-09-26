/**
 * Clip windows around moments where the picture changed.
 * Adapted from Atmosphere `backend/src/verification/frames/clips.ts` (commit a9e2680).
 * Scope keeps the window math and leaves storage to the caller.
 */

export type ChangeMoment = { id: string; frameIds: string[]; timestamps: number[] };

export type ClipWindow = { changeId: string; startSeconds: number; endSeconds: number; frameIds: string[] };

export function clipWindows(events: ChangeMoment[]): ClipWindow[] {
  const windows: ClipWindow[] = [];
  for (const event of events) {
    if (!event.timestamps.length) continue;
    const start = Math.max(0, Math.min(...event.timestamps) - 1);
    const end = Math.max(...event.timestamps) + 1;
    windows.push({ changeId: event.id, startSeconds: start, endSeconds: Math.max(end, start + 0.5), frameIds: event.frameIds });
  }
  return windows;
}
