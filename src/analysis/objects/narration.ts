import { screenText } from "@/analysis/guard";
import type { DamageType, ObjectCategory, TranscriptSegment } from "@/domain/types";

/**
 * Pull extent and damage words out of the narrator's own words.
 * Adapted from Atmosphere's evidence fusion (`backend/src/audio/evidenceFusion.ts`):
 * a quote must be a verbatim span, and instruction-like lines are not measurements.
 */

export type NarrationCue = {
  roomName: string | null;
  categories: ObjectCategory[];
  damageTypes: DamageType[];
  heightFt: number | null;
  lengthFt: number | null;
  quote: string;
  startMs: number;
  unclear: boolean;
};

const CATEGORY_WORDS: { category: ObjectCategory; re: RegExp }[] = [
  { category: "drywall", re: /\b(drywall|sheetrock|wall|walls)\b/i },
  { category: "ceiling", re: /\bceiling\b/i },
  { category: "baseboard", re: /\b(baseboard|base board|base)\b/i },
  { category: "trim", re: /\btrim\b/i },
  { category: "casing", re: /\bcasing\b/i },
  { category: "door", re: /\bdoor\b/i },
  { category: "window", re: /\bwindow\b/i },
  { category: "flooring", re: /\b(floor|flooring)\b/i },
  { category: "cabinet", re: /\bcabinet\b/i },
  { category: "countertop", re: /\bcounter/i },
  { category: "outlet", re: /\boutlets?\b/i },
  { category: "switch", re: /\bswitches\b|\bswitch\b/i },
  { category: "light", re: /\blights?\b/i },
  { category: "plumbing", re: /\b(sink|toilet|tub|faucet)\b/i },
  { category: "appliance", re: /\b(refrigerator|dishwasher|range|oven|stove)\b/i },
  { category: "contents", re: /\b(sofa|couch|chair|table|contents)\b/i },
  { category: "furniture", re: /\b(sofa|couch|chair|dresser|furniture)\b/i },
];

export function narrationCues(segments: TranscriptSegment[]): NarrationCue[] {
  const cues: NarrationCue[] = [];
  let room: string | null = null;
  const ordered = [...segments].sort((a, b) => a.startMs - b.startMs);
  for (const segment of ordered) {
    if (screenText(segment.text).length) continue;
    const announced = announcedRoom(segment.text);
    if (announced) room = announced;
    const categories = CATEGORY_WORDS.filter((entry) => entry.re.test(segment.text)).map((entry) => entry.category);
    const damageTypes = damageIn(segment.text);
    const heightFt = firstNumber(segment.text, /(?:wet|water|damp|saturated)\s+to\s+(\d+(?:\.\d+)?)\s*(?:feet|ft|foot)\b/i);
    const lengthFt = firstNumber(segment.text, /(?:along|for|about|around)\s+(\d+(?:\.\d+)?)\s*(?:feet|ft|foot)\b/i)
      ?? firstNumber(segment.text, /(\d+(?:\.\d+)?)\s*(?:feet|ft|foot)\s+of\b/i);
    const unclear = /can(?:not|'t) tell|not sure|unclear|hard to see/i.test(segment.text);
    if (!categories.length && !damageTypes.length && heightFt == null && lengthFt == null && !unclear) continue;
    const wallImplied = heightFt != null && categories.includes("drywall") === false && /\bwall\b/i.test(segment.text);
    const cats = wallImplied ? [...new Set<ObjectCategory>([...categories, "drywall"])] : categories;
    cues.push({
      roomName: room,
      categories: cats,
      damageTypes,
      heightFt,
      lengthFt,
      quote: segment.text.trim(),
      startMs: segment.startMs,
      unclear,
    });
  }
  return cues;
}

/** Room name from a line such as "This is the kitchen." */
export function announcedRoom(text: string): string | null {
  const announced = text.match(/(?:this is|we're in|we are in|entering)\s+(?:the\s+)?([a-z][a-z0-9 '/-]{1,40})/i);
  if (!announced?.[1]) return null;
  const name = titleCase(announced[1].replace(/\b(on the|about|and|with|where)\b[\s\S]*$/i, "").trim());
  return name || null;
}

/** Room announced at or before `timeMs`. Later announcements replace earlier ones. */
export function roomAt(segments: TranscriptSegment[], timeMs: number): string | null {
  let room: string | null = null;
  for (const segment of [...segments].sort((a, b) => a.startMs - b.startMs)) {
    if (segment.startMs > timeMs) break;
    if (screenText(segment.text).length) continue;
    const announced = announcedRoom(segment.text);
    if (announced) room = announced;
  }
  return room;
}

export function cueMatches(cue: NarrationCue, roomName: string, category: ObjectCategory, label: string): boolean {
  if (cue.roomName && cue.roomName.toLowerCase() !== roomName.toLowerCase()) return false;
  if (cue.categories.includes(category)) return true;
  const labelHit = cue.categories.length === 0 && label && cue.quote.toLowerCase().includes(label.toLowerCase());
  return Boolean(labelHit);
}

function damageIn(text: string): DamageType[] {
  const found: DamageType[] = [];
  const add = (type: DamageType, re: RegExp) => {
    if (re.test(text)) found.push(type);
  };
  add("wet", /\bwet\b|\bsaturated\b|\bmoisture\b/i);
  add("water_staining", /\bstain/i);
  add("swelling", /\bswell/i);
  add("delamination", /\bdelaminat/i);
  add("mold", /\bmold\b|\bmicrobial\b/i);
  add("cracking", /\bcrack/i);
  add("burn", /\bburn|\bchar/i);
  add("smoke", /\bsmoke\b|\bsoot\b/i);
  add("missing", /\bmissing\b|\bgone\b/i);
  return found;
}

function firstNumber(text: string, re: RegExp): number | null {
  const match = text.match(re);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function titleCase(value: string): string {
  return value.trim().replace(/\s+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
