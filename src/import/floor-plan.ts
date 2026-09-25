import { floorPlanFromMeasurement, type FloorPlan, type ImportedQuantities, type MeasuredRoomInput } from "@/domain/plan-from-measurement";
import type { Point } from "@/domain/types";

export type ImportRequest = {
  filename: string;
  text: string;
  unit?: "ft" | "in" | "m" | "";
  feetPerUnit?: number | null;
};

export type CrossCheck = {
  room: string;
  item: string;
  imported: number | null;
  video: number | null;
  note: string;
};

export type FloorPlanImport = {
  source: "csv" | "magicplan" | "dxf" | "svg" | "hover";
  sourceLabel: string;
  plan: FloorPlan;
  notes: string[];
};

const FEET: Record<string, number> = { ft: 1, in: 1 / 12, m: 3.280839895 };

export function importFloorPlan(input: ImportRequest): FloorPlanImport {
  const text = input.text.replace(/^\uFEFF/, "");
  const name = input.filename.toLowerCase();
  if (!text.trim()) throw new Error("The file was empty.");
  if (text.trim().startsWith("{") || name.endsWith(".json")) return importHover(text);
  if (/<svg[\s>]/i.test(text) || name.endsWith(".svg")) return importSvg(text, input.feetPerUnit);
  if (/^\s*0\s*$/m.test(text) && /LWPOLYLINE|SECTION/i.test(text) || name.endsWith(".dxf")) return importDxf(text, input.unit);
  return importCsv(text, name);
}

export function crossCheckPlans(imported: FloorPlan, video: FloorPlan): CrossCheck[] {
  const checks: CrossCheck[] = [];
  for (const room of imported.rooms) {
    const importedName = imported.names[room.roomId] ?? room.roomId;
    const match = video.rooms.find((item) => normalize(video.names[item.roomId] ?? "") === normalize(importedName));
    if (!match) {
      checks.push({ room: importedName, item: "room", imported: null, video: null, note: "No video room uses this name, so the walls were not compared." });
      continue;
    }
    compare(checks, importedName, "Floor", quantity(imported, room.roomId, "floor_area"), quantity(video, match.roomId, "floor_area"));
    compare(checks, importedName, "Ceiling", imported.ceilingHeights[room.roomId]?.valueFt ?? null, video.ceilingHeights[match.roomId]?.valueFt ?? null);
    const importedWalls = wallValues(imported, room.roomId);
    const videoWalls = wallValues(video, match.roomId);
    const pairs = Math.min(importedWalls.length, videoWalls.length);
    for (let index = 0; index < pairs; index += 1) compare(checks, importedName, `Wall ${index + 1}`, importedWalls[index], videoWalls[index]);
    if (importedWalls.length !== videoWalls.length) {
      checks.push({ room: importedName, item: "Walls", imported: importedWalls.length, video: videoWalls.length, note: "The wall counts differ. Extra walls were not paired." });
    }
  }
  return checks;
}

function importCsv(text: string, filename: string): FloorPlanImport {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("The CSV needs a header row and one room.");
  const header = rows[0].map((cell) => normalize(cell).replace(/\s+/g, "_"));
  const magicplan = header.some((cell) => ["area_without_walls", "walls_surface", "ground_perimeter", "area_with_walls"].includes(cell));
  const source = magicplan ? "magicplan" : "csv";
  const label = magicplan ? "magicplan statistics CSV" : "CSV";
  const rooms: MeasuredRoomInput[] = [];
  const notes = [`Imported from ${label}. These lengths were measured by that file, not confirmed with a tape here.`];
  rows.slice(1).forEach((row, index) => {
    if (row.every((cell) => !cell.trim())) return;
    const record = Object.fromEntries(header.map((key, cell) => [key, row[cell] ?? ""]));
    const name = record.name || record.room || record.room_name || `Room ${index + 1}`;
    const width = firstLength(record, ["width_ft", "width", "span_a"]);
    const depth = firstLength(record, ["depth_ft", "depth", "length_ft", "length", "span_b"]);
    const pair = parsePair(record.dimensions || record.dimension || "");
    const spanA = width ?? pair?.[0] ?? null;
    const spanB = depth ?? pair?.[1] ?? null;
    const height = firstLength(record, ["height_ft", "height", "ceiling_height"]);
    const area = firstLength(record, ["floor_area", "area_without_walls", "area"]);
    const perimeter = firstLength(record, ["perimeter", "floor_edges", "ground_perimeter"]);
    if (spanA == null || spanB == null) {
      if (area == null && perimeter == null && height == null) return;
      const importedQuantities: ImportedQuantities = { from: label, floorSqft: area, perimeterLf: perimeter };
      rooms.push({
        id: slug(name, index),
        name,
        dimensions: height == null ? [] : [{ kind: "ceiling_height", label: "height", valueFt: height, importedFrom: label }],
        importedQuantities,
      });
      notes.push(`${name}: wall lengths were not in the row. Area and perimeter were kept. No rectangle was invented.`);
      return;
    }
    rooms.push({
      id: slug(name, index),
      name,
      dimensions: [
        { kind: "wall_length", label: "width", valueFt: spanA, importedFrom: label },
        { kind: "wall_length", label: "depth", valueFt: spanB, importedFrom: label },
        ...(height == null ? [] : [{ kind: "ceiling_height" as const, label: "height", valueFt: height, importedFrom: label }]),
      ],
      importedQuantities: { from: label },
    });
  });
  if (!rooms.length) throw new Error("No room row had a name and either wall lengths or an area.");
  if (!magicplan && filename.includes("magicplan")) notes.push("The filename mentions magicplan. The columns did not match the statistics export, so this was read as a generic CSV.");
  return { source, sourceLabel: label, notes, plan: floorPlanFromMeasurement(rooms, `Imported from ${label}.`) };
}

function importHover(text: string): FloorPlanImport {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("The JSON could not be read.");
  }
  const rooms = hoverRooms(body);
  if (!rooms.length) throw new Error("No Hover rooms were found. Expected rooms with name and floor_area, as in Hover's measurements JSON.");
  const label = "Hover measurements JSON";
  const notes = [
    "Imported from Hover measurements JSON. Hover's documented interior example gives floor area, perimeter, ceiling height, and wall areas. It does not give each wall's length, so no outline was invented.",
    "Door and window width were not in this file. Openings were not guessed from area and perimeter.",
    "Fetching this JSON from Hover requires their API credentials. This importer only reads a file you already have.",
  ];
  const measured: MeasuredRoomInput[] = rooms.map((room, index) => {
    const height = room.minCeiling != null && room.maxCeiling != null && room.minCeiling === room.maxCeiling ? room.maxCeiling : null;
    if (room.minCeiling != null && room.maxCeiling != null && room.minCeiling !== room.maxCeiling) {
      notes.push(`${room.name}: Hover listed ceiling ${room.minCeiling}–${room.maxCeiling} ft. A single height was not chosen.`);
    }
    return {
      id: slug(room.name, index),
      name: room.name,
      dimensions: height == null ? [] : [{ kind: "ceiling_height", label: "height", valueFt: height, importedFrom: label }],
      importedQuantities: { from: label, floorSqft: room.floorArea, perimeterLf: room.perimeter, wallSqft: room.wallArea },
    };
  });
  return { source: "hover", sourceLabel: label, notes, plan: floorPlanFromMeasurement(measured, `Imported from ${label}.`) };
}

function importDxf(text: string, unit: ImportRequest["unit"]): FloorPlanImport {
  const pairs = dxfPairs(text);
  const insunits = insunitsOf(pairs);
  const scale = insunits == null ? (unit ? FEET[unit] : null) : insunits;
  if (scale == null) throw new Error("This DXF has no $INSUNITS. Choose feet, inches, or meters. The unit was not guessed.");
  const loops = lwpolylines(pairs);
  if (!loops.length) throw new Error("No closed LWPOLYLINE was found. Separate LINE entities were not joined into a room.");
  const label = "DXF";
  const unitName = insunits === 1 ? "feet" : insunits === 1 / 12 ? "inches" : insunits === 3.280839895 ? "meters" : unit || "file units";
  const rooms = loops.map((loop, index) => polygonRoom(`Room ${index + 1}`, index, loop.map((point) => ({ x: round3(point.x * scale), y: round3(point.y * scale) })), label));
  const notes = [`Imported from DXF. Closed polylines were read as rooms. Units: ${unitName}. ${insunits == null ? "The file did not name its units, so the choice on this form was used." : "$INSUNITS was used."}`];
  return { source: "dxf", sourceLabel: label, notes, plan: floorPlanFromMeasurement(rooms, "Imported from DXF.") };
}

function importSvg(text: string, feetPerUnit: number | null | undefined): FloorPlanImport {
  if (feetPerUnit == null || !Number.isFinite(feetPerUnit) || feetPerUnit <= 0) throw new Error("SVG units are not feet. Enter how many feet one drawing unit represents.");
  const shapes = [...svgPolygons(text), ...svgRects(text)];
  if (!shapes.length) throw new Error("No polygon or rect was found in the SVG.");
  const label = "SVG";
  const rooms = shapes.map((shape, index) => polygonRoom(shape.name || `Room ${index + 1}`, index, shape.points.map((point) => ({ x: round3(point.x * feetPerUnit), y: round3(point.y * feetPerUnit) })), label));
  return {
    source: "svg",
    sourceLabel: label,
    notes: [`Imported from SVG. One drawing unit was taken as ${feetPerUnit} ft, from the value entered here. The file did not say.`],
    plan: floorPlanFromMeasurement(rooms, "Imported from SVG."),
  };
}

function polygonRoom(name: string, index: number, polygon: Point[], label: string): MeasuredRoomInput {
  if (polygon.length < 3) throw new Error(`${name} needs at least three corners.`);
  const dimensions = polygon.map((_, edge) => {
    const next = polygon[(edge + 1) % polygon.length];
    const start = polygon[edge];
    return { kind: "wall_length" as const, label: `edge_${edge + 1}`, valueFt: round3(Math.hypot(next.x - start.x, next.y - start.y)), importedFrom: label };
  });
  return { id: slug(name, index), name, polygonFt: polygon, dimensions, importedQuantities: { from: label } };
}

function compare(checks: CrossCheck[], room: string, item: string, imported: number | null, video: number | null) {
  if (imported == null || video == null) {
    checks.push({ room, item, imported, video, note: "One side has no value, so they were not called a match." });
    return;
  }
  const delta = Math.abs(imported - video) / Math.max(imported, video);
  checks.push({
    room,
    item,
    imported,
    video,
    note: delta <= 0.05 ? "Within 5%. The import and the video still are not a tape confirmation." : `They differ by ${round3(delta * 100)}%. Neither value was replaced.`,
  });
}

function quantity(plan: FloorPlan, roomId: string, kind: FloorPlan["quantities"][number]["kind"]): number | null {
  return plan.quantities.find((item) => item.roomId === roomId && item.kind === kind)?.value ?? null;
}

function wallValues(plan: FloorPlan, roomId: string): number[] {
  return plan.edges.filter((edge) => edge.roomId === roomId && edge.valueFt != null).map((edge) => edge.valueFt!).sort((a, b) => a - b);
}

function hoverRooms(body: unknown): { name: string; floorArea: number | null; perimeter: number | null; wallArea: number | null; minCeiling: number | null; maxCeiling: number | null }[] {
  const list = findRooms(body);
  return list.map((room) => {
    const walls = Array.isArray(room.walls) ? room.walls : [];
    const wallArea = walls.reduce((sum, wall) => sum + (number(wall && typeof wall === "object" ? (wall as { area?: unknown }).area : null) ?? 0), 0);
    return {
      name: typeof room.name === "string" && room.name.trim() ? room.name.trim() : "Room",
      floorArea: number(room.floor_area),
      perimeter: number(room.floor_edges),
      wallArea: wallArea > 0 ? round3(wallArea) : null,
      minCeiling: number(room.min_ceiling_height),
      maxCeiling: number(room.max_ceiling_height),
    };
  }).filter((room) => room.floorArea != null || room.perimeter != null);
}

function findRooms(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  if (Array.isArray(record.rooms)) return record.rooms.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  for (const value of Object.values(record)) {
    const nested = findRooms(value);
    if (nested.length) return nested;
  }
  return [];
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((item) => item)) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some((item) => item)) rows.push(row);
  return rows;
}

function firstLength(record: Record<string, string>, keys: string[]): number | null {
  for (const key of keys) {
    if (record[key]) return parseLength(record[key]);
  }
  return null;
}

function parsePair(value: string): [number, number] | null {
  const match = value.match(/(.+?)\s*[x×]\s*(.+)/i);
  if (!match) return null;
  const width = parseLength(match[1]);
  const depth = parseLength(match[2]);
  if (width == null || depth == null) return null;
  return [width, depth];
}

export function parseLength(value: string): number | null {
  const text = value.trim().toLowerCase().replace(/feet/g, "ft");
  if (!text || text === "-" || text === "n/a") return null;
  const feetInches = text.match(/(\d+(?:\.\d+)?)\s*(?:'|ft)\s*(\d+(?:\.\d+)?)?\s*(?:"|in)?/);
  if (feetInches) return round3(Number(feetInches[1]) + (feetInches[2] ? Number(feetInches[2]) / 12 : 0));
  const inches = text.match(/(\d+(?:\.\d+)?)\s*(?:"|in)\b/);
  if (inches) return round3(Number(inches[1]) / 12);
  const plain = text.match(/-?\d+(?:\.\d+)?/);
  return plain ? round3(Number(plain[0])) : null;
}

function dxfPairs(text: string): { code: string; value: string }[] {
  const lines = text.split(/\r?\n/);
  const pairs: { code: string; value: string }[] = [];
  for (let index = 0; index + 1 < lines.length; index += 2) pairs.push({ code: lines[index].trim(), value: lines[index + 1].trim() });
  return pairs;
}

function insunitsOf(pairs: { code: string; value: string }[]): number | null {
  for (let index = 0; index < pairs.length; index += 1) {
    if (pairs[index].code === "9" && pairs[index].value === "$INSUNITS") {
      const next = pairs.slice(index + 1).find((pair) => pair.code === "70");
      const code = Number(next?.value);
      if (code === 1) return 1 / 12;
      if (code === 2) return 1;
      if (code === 4) return 3.280839895 / 1000;
      if (code === 5) return 3.280839895 / 100;
      if (code === 6) return 3.280839895;
    }
  }
  return null;
}

function lwpolylines(pairs: { code: string; value: string }[]): Point[][] {
  const loops: Point[][] = [];
  for (let index = 0; index < pairs.length; index += 1) {
    if (pairs[index].code !== "0" || pairs[index].value !== "LWPOLYLINE") continue;
    const points: Point[] = [];
    let closed = false;
    let x: number | null = null;
    for (let cursor = index + 1; cursor < pairs.length; cursor += 1) {
      if (pairs[cursor].code === "0") break;
      if (pairs[cursor].code === "70") closed = (Number(pairs[cursor].value) & 1) === 1;
      if (pairs[cursor].code === "10") x = Number(pairs[cursor].value);
      if (pairs[cursor].code === "20" && x != null && Number.isFinite(x) && Number.isFinite(Number(pairs[cursor].value))) {
        points.push({ x, y: Number(pairs[cursor].value) });
        x = null;
      }
    }
    if (closed && points.length >= 3) loops.push(points);
  }
  return loops;
}

function svgPolygons(text: string): { name: string; points: Point[] }[] {
  const found: { name: string; points: Point[] }[] = [];
  const pattern = /<polygon\b([^>]*)>/gi;
  for (const match of text.matchAll(pattern)) {
    const points = attr(match[1], "points");
    const parsed = (points.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const ring: Point[] = [];
    for (let index = 0; index + 1 < parsed.length; index += 2) ring.push({ x: parsed[index], y: parsed[index + 1] });
    if (ring.length >= 3) found.push({ name: attr(match[1], "id") || attr(match[1], "data-name"), points: ring });
  }
  return found;
}

function svgRects(text: string): { name: string; points: Point[] }[] {
  const found: { name: string; points: Point[] }[] = [];
  const pattern = /<rect\b([^>]*)>/gi;
  for (const match of text.matchAll(pattern)) {
    const x = Number(attr(match[1], "x") || 0);
    const y = Number(attr(match[1], "y") || 0);
    const width = Number(attr(match[1], "width"));
    const height = Number(attr(match[1], "height"));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;
    found.push({ name: attr(match[1], "id") || attr(match[1], "data-name"), points: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }] });
  }
  return found;
}

function attr(source: string, name: string): string {
  const match = source.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match?.[1]?.trim() ?? "";
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function slug(name: string, index: number): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "room";
  return `${base}-${index + 1}`;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
