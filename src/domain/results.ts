import type { InventoryLine } from "@/analysis/inventory";

export type ResultOffer = {
  query: string;
  title: string | null;
  retailer: string | null;
  price: number | null;
  currency: string | null;
  url: string | null;
  status: "verified" | "unverified" | "unpriced";
  note: string;
};

export type ResultReplacement = {
  title: string | null;
  retailer: string | null;
  unitPrice: number | null;
  currency: string | null;
  url: string | null;
  status: "verified" | "unverified" | "unpriced" | "manual";
  note: string;
};

export type ResultLine = {
  id: string;
  room: string;
  item: string;
  quantity: number | null;
  unit: string;
  evidence: string;
  links: InventoryLine["links"];
  replacements: ResultReplacement[];
  selected: number;
  lineTotal: number | null;
  note: string;
};

export type ResultTotals = {
  rooms: { room: string; total: number | null; unverified: boolean }[];
  job: number | null;
  note: string;
};

export function buildResultLines(items: InventoryLine[], offers: ResultOffer[]): ResultLine[] {
  return items.map((item, index) => {
    const matches = offers.filter((offer) => normalize(offer.query) === normalize(item.name));
    const replacements = matches.length ? matches.map(toReplacement) : [emptyReplacement(item.name)];
    return finish({
      id: `${item.room ?? "unassigned"}:${item.name}:${index}`,
      room: item.room ?? "Room not assigned",
      item: item.name,
      quantity: item.quantity,
      unit: item.unit,
      evidence: item.evidence,
      links: item.links,
      replacements,
      selected: 0,
      lineTotal: null,
      note: item.note,
    });
  });
}

export function chooseReplacement(lines: ResultLine[], id: string, index: number): ResultLine[] {
  return lines.map((line) => (line.id === id && index >= 0 && index < line.replacements.length ? finish({ ...line, selected: index }) : line));
}

export function overrideReplacement(lines: ResultLine[], id: string, entry: { title: string; unitPrice: number | null; note?: string }): ResultLine[] {
  return lines.map((line) => {
    if (line.id !== id) return line;
    const manual: ResultReplacement = {
      title: entry.title.trim() || null,
      retailer: null,
      unitPrice: entry.unitPrice != null && Number.isFinite(entry.unitPrice) && entry.unitPrice >= 0 ? round2(entry.unitPrice) : null,
      currency: "USD",
      url: null,
      status: "manual",
      note: entry.note?.trim() || "Entered by hand. Not checked against a retailer page.",
    };
    const replacements = [...line.replacements.filter((item) => item.status !== "manual"), manual];
    return finish({ ...line, replacements, selected: replacements.length - 1 });
  });
}

export function resultTotals(lines: ResultLine[]): ResultTotals {
  const rooms = new Map<string, ResultLine[]>();
  for (const line of lines) rooms.set(line.room, [...(rooms.get(line.room) ?? []), line]);
  const roomTotals = [...rooms.entries()].map(([room, group]) => {
    const priced = group.map((line) => line.lineTotal).filter((value): value is number => value != null);
    const unverified = group.some((line) => line.lineTotal != null && selected(line).status !== "verified");
    return { room, total: priced.length ? round2(priced.reduce((sum, value) => sum + value, 0)) : null, unverified };
  });
  const jobParts = roomTotals.map((room) => room.total).filter((value): value is number => value != null);
  const unverified = roomTotals.some((room) => room.unverified);
  return {
    rooms: roomTotals,
    job: jobParts.length ? round2(jobParts.reduce((sum, value) => sum + value, 0)) : null,
    note: jobParts.length === 0
      ? "No line has both a quantity and a price, so there is no job total."
      : unverified
        ? "This total includes unverified or hand-entered prices. It is not an approved estimate."
        : "Every priced line was verified on its retailer page. It is still not an approved estimate.",
  };
}

function finish(line: ResultLine): ResultLine {
  const choice = selected(line);
  const lineTotal = line.quantity != null && choice.unitPrice != null ? round2(line.quantity * choice.unitPrice) : null;
  return { ...line, lineTotal };
}

function selected(line: ResultLine): ResultReplacement {
  return line.replacements[line.selected] ?? line.replacements[0];
}

function toReplacement(offer: ResultOffer): ResultReplacement {
  return {
    title: offer.title,
    retailer: offer.retailer,
    unitPrice: offer.price,
    currency: offer.currency,
    url: offer.url,
    status: offer.status,
    note: offer.note,
  };
}

function emptyReplacement(name: string): ResultReplacement {
  return { title: null, retailer: null, unitPrice: null, currency: null, url: null, status: "unpriced", note: `No replacement was returned for ${name}.` };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
