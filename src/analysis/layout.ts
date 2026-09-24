import { createId } from "@/domain/ids";
import { applyEvaluation, edgeLength, rectangle } from "@/domain/geometry";
import type { FrameObservation, Room, SketchDimension, SketchDocument, SketchOpening, TranscriptSegment } from "@/domain/types";
import { SKETCH_DISCLAIMER } from "@/domain/types";
import { parseMeasurement } from "@/domain/quantities";

export type RoomMention = {
  name: string;
  floorName: string;
  widthFt: number | null;
  depthFt: number | null;
  heightFt: number | null;
  widthNote: string;
  irregular: boolean;
  obscured: boolean;
  connectsTo: string[];
};

export function mentionRooms(segments: TranscriptSegment[], frames: FrameObservation[]): RoomMention[] {
  const mentions = new Map<string, RoomMention>();
  const ensure = (name: string, floorName = "Main floor") => {
    const key = name.toLowerCase();
    if (!mentions.has(key)) {
      mentions.set(key, { name, floorName, widthFt: null, depthFt: null, heightFt: null, widthNote: "", irregular: false, obscured: false, connectsTo: [] });
    }
    return mentions.get(key)!;
  };

  let carryRoom: RoomMention | null = null;
  let carryMedia = "";
  for (const segment of [...segments].sort((a, b) => a.mediaId.localeCompare(b.mediaId) || a.startMs - b.startMs)) {
    if (segment.mediaId !== carryMedia) {
      carryMedia = segment.mediaId;
      carryRoom = null;
    }
    if (segment.injectionFlags.length) continue;
    const floor: string = /basement/i.test(segment.text) ? "Basement" : /upstairs|second floor/i.test(segment.text) ? "Second floor" : carryRoom?.floorName ?? "Main floor";
    const named = segment.text.match(/(?:this is|we're in|we are in|entering|room is)\s+(?:the\s+)?([a-z][a-z0-9 '/-]{1,40})/i);
    const room: RoomMention | null = named ? ensure(cleanRoomName(named[1]), floor) : carryRoom;
    if (room) carryRoom = room;
    const size = segment.text.match(/(\d+(?:\.\d+)?(?:\s*(?:ft|foot|feet|')\s*\d+(?:\.\d+)?)?)\s*(?:by|x|×)\s*(\d+(?:\.\d+)?(?:\s*(?:ft|foot|feet|')\s*\d+)?)/i);
    if (room && size) {
      const width = parseMeasurement(size[1].includes("ft") || size[1].includes("'") ? size[1] : `${size[1]} ft`);
      const depth = parseMeasurement(size[2].includes("ft") || size[2].includes("'") ? size[2] : `${size[2]} ft`);
      if (width && depth) {
        if (room.widthFt != null && Math.abs(room.widthFt - width.valueFt) > 0.2) room.widthNote = `Narration also said ${room.widthFt} ft`;
        room.widthFt = width.valueFt;
        room.depthFt = depth.valueFt;
        room.widthNote = room.widthNote || `Narrated in media ${segment.mediaId} at ${segment.startMs} ms. Not a locked measurement.`;
      }
    }
    const height = segment.text.match(/ceiling(?: height)?(?: is| of)?\s*(\d+(?:\.\d+)?)\s*(?:ft|foot|feet|')/i);
    if (room && height) room.heightFt = Number(height[1]);
    if (room && /l[- ]?shape|irregular/i.test(segment.text)) room.irregular = true;
    if (room && /can't see the corner|cannot see the corner|obscured/i.test(segment.text)) room.obscured = true;
    const link = segment.text.match(/connects to (?:the )?([a-z][a-z0-9 ]{1,30})/i);
    if (room && link) room.connectsTo.push(titleCase(link[1].trim()));
    if (!named) {
      const loose = segment.text.match(/\b(kitchen|hallway|bath|bathroom|bedroom|living room|basement|dining room|guest room)\b/i);
      if (loose) carryRoom = ensure(titleCase(loose[1] === "bath" ? "bathroom" : loose[1]), floor);
    }
  }

  for (const frame of frames) {
    if (!frame.roomHint) continue;
    const room = ensure(titleCase(frame.roomHint));
    if (frame.features.includes("obscured")) room.obscured = true;
  }
  return [...mentions.values()];
}

export function layoutFromMentions(rooms: Room[], mentions: RoomMention[], frames: FrameObservation[]): SketchDocument {
  const geometryRooms = [];
  const dimensions: SketchDimension[] = [];
  const openings: SketchOpening[] = [];
  const ceilingHeights: SketchDocument["ceilingHeights"] = {};
  let cursorX = 0;
  for (const room of rooms) {
    const mention = mentions.find((item) => item.name.toLowerCase() === room.name.toLowerCase());
    const width = mention?.widthFt ?? 10;
    const depth = mention?.depthFt ?? 8;
    const inferredSize = !mention?.widthFt || !mention?.depthFt;
    let polygon = rectangle(cursorX, 0, width, depth);
    if (mention?.irregular) {
      polygon = [
        { x: cursorX, y: 0 },
        { x: cursorX + width, y: 0 },
        { x: cursorX + width, y: depth * 0.55 },
        { x: cursorX + width * 0.62, y: depth * 0.55 },
        { x: cursorX + width * 0.62, y: depth },
        { x: cursorX, y: depth },
      ];
    }
    geometryRooms.push({
      id: createId("sroom"),
      roomId: room.id,
      polygon,
      provenance: inferredSize ? ("inferred" as const) : ("reported" as const),
      incomplete: Boolean(mention?.obscured),
      incompleteReason: mention?.obscured ? "A corner was obscured or not captured." : undefined,
    });
    for (let edge = 0; edge < polygon.length; edge += 1) {
      const narrated = !inferredSize && edge === 0 ? mention?.widthFt : !inferredSize && edge === 1 && !mention?.irregular ? mention?.depthFt : null;
      dimensions.push({
        id: createId("dim"),
        target: { type: "edge", roomId: room.id, edgeIndex: edge },
        valueFt: narrated ?? (inferredSize ? null : round2(edgeLength(polygon, edge))),
        status: narrated ? "inferred" : inferredSize ? "unresolved" : "inferred",
        locked: false,
        provenance: narrated ? "reported" : "inferred",
        sourceNote: narrated ? mention?.widthNote || "Narrated dimension. Not locked." : inferredSize ? "Placeholder extent for a schematic. Not a measurement." : "Schematic edge. Not independently measured.",
      });
    }
    ceilingHeights[room.id] = mention?.heightFt
      ? { valueFt: mention.heightFt, status: "provisional", provenance: "reported", sourceNote: "Ceiling height was spoken, not instrument-confirmed." }
      : { valueFt: null, status: "unresolved", provenance: "inferred", sourceNote: "Ceiling height was not stated." };
    cursorX += width + 1.5;
  }

  for (const mention of mentions) {
    const from = rooms.find((room) => room.name.toLowerCase() === mention.name.toLowerCase());
    if (!from) continue;
    for (const targetName of mention.connectsTo) {
      const to = rooms.find((room) => room.name.toLowerCase() === targetName.toLowerCase());
      const seenTransition = frames.some((frame) => frame.features.includes("transition") && frame.roomHint?.toLowerCase() === mention.name.toLowerCase());
      openings.push({
        id: createId("opn"),
        roomId: from.id,
        edgeIndex: 1,
        kind: "door",
        offsetFt: 1,
        widthFt: null,
        heightFt: null,
        connectsToRoomId: to?.id ?? null,
        connectionStatus: to && seenTransition ? "inferred" : "unresolved",
        provenance: "inferred",
      });
    }
    if (frames.some((frame) => frame.roomHint?.toLowerCase() === mention.name.toLowerCase() && frame.features.includes("window"))) {
      openings.push({
        id: createId("opn"),
        roomId: from.id,
        edgeIndex: 0,
        kind: "window",
        offsetFt: 2,
        widthFt: null,
        heightFt: null,
        connectsToRoomId: null,
        connectionStatus: "none",
        provenance: "inferred",
      });
    }
  }

  return applyEvaluation({
    id: createId("sketch"),
    units: "ft",
    state: "provisional_layout",
    scaleClaim: "not_to_scale",
    scaleClaimReason: "",
    ceilingHeights,
    geometry: { rooms: geometryRooms, openings, fixtures: [], annotations: [], dimensions },
    undo: [],
    redo: [],
    disclaimer: SKETCH_DISCLAIMER,
  });
}

function titleCase(value: string): string {
  return value.trim().replace(/\s+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cleanRoomName(raw: string): string {
  return titleCase(raw.replace(/\b(on the|about|and|with|where|which|upstairs|downstairs)\b[\s\S]*$/i, ""));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function conflictingNarratedLengths(segments: TranscriptSegment[], roomName: string): number[] {
  const values: number[] = [];
  for (const segment of segments) {
    if (!segment.text.toLowerCase().includes(roomName.toLowerCase())) continue;
    const size = segment.text.match(/(\d+(?:\.\d+)?)\s*(?:ft|foot|feet|')\s*(?:by|x)/i);
    if (size) values.push(Number(size[1]));
  }
  return values;
}
