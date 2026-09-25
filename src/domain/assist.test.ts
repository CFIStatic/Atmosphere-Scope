import { describe, expect, it } from "vitest";
import type { WalkthroughSnapshot } from "@/capture/snapshot";
import { ASSIST_PARAMETERS, buildReview, confirmProposal, diffProposal, interpretUtterance, notesFromNarration, parseProposal } from "@/domain/assist";
import { proposeCommand } from "@/analysis/openai/command";

const snapshot: WalkthroughSnapshot = {
  savedAt: "2026-09-25T00:00:00.000Z",
  source: "measurement",
  transcript: "The vanity might have been replaced.",
  transcriptNote: "Transcript stored as speech. It is not a measurement.",
  plan: {
    rooms: [{ id: "kitchen", roomId: "kitchen", polygon: [], provenance: "inferred", incomplete: false } as unknown as WalkthroughSnapshot["plan"]["rooms"][number]],
    openings: [],
    annotations: [],
    dimensions: [],
    ceilingHeights: { kitchen: { valueFt: null, status: "unresolved", provenance: "inferred", sourceNote: "Not visible." } },
    edges: [
      { roomId: "kitchen", edgeIndex: 0, valueFt: 12, status: "estimated", stroke: "solid", label: "span_a" },
      { roomId: "kitchen", edgeIndex: 1, valueFt: 14, status: "estimated", stroke: "solid", label: "span_b" },
    ],
    quantities: [
      { roomId: "kitchen", roomName: "Kitchen", kind: "floor_area", label: "Floor area", value: 168, unit: "sqft", status: "estimated", note: "Estimated." },
      { roomId: "kitchen", roomName: "Kitchen", kind: "wall_area", label: "Wall area", value: null, unit: "sqft", status: "unmeasured", note: "No height." },
    ],
    names: { kitchen: "Kitchen" },
    overrides: {},
    disclaimer: "",
  },
  objects: [
    { name: "Vanity", room: "Kitchen", evidence: "Seen once.", confidence: "low", frames: ["frame_01.jpg"], quantity: 1 },
    { name: "Sofa", room: "Kitchen", evidence: "Seen twice.", confidence: "high", frames: ["frame_02.jpg"], quantity: 1 },
  ],
  offers: [
    { query: "Sofa", title: "Sofa", retailer: "Example", price: 400, currency: "USD", url: "https://shop.example/sofa", status: "verified", note: "Checked." },
    { query: "Flooring", title: "Flooring", retailer: "Example", price: 2, currency: "USD", url: null, status: "verified", note: "Checked." },
  ],
};

describe("assist schema", () => {
  it("rejects prices and extra fields", () => {
    expect(ASSIST_PARAMETERS.additionalProperties).toBe(false);
    expect(JSON.stringify(ASSIST_PARAMETERS)).not.toContain("price");
    expect(parseProposal({
      intent: "edit",
      answer: null,
      unknown: null,
      changes: [{ op: "add_item", target: "dining chairs", value: 2, reason: "asked", price: 80 }],
    })).toBeNull();
    expect(parseProposal({ intent: "edit", answer: null, unknown: null, changes: [], invented: true })).toBeNull();
  });

  it("maps a sentence to a change and does not apply it until confirm", () => {
    const { proposal } = interpretUtterance("add two dining chairs", snapshot);
    const diffs = diffProposal(snapshot, proposal);
    expect(diffs[0]?.after).toMatch(/needs price/);
    expect(snapshot.objects.map((item) => item.name)).not.toContain("dining chairs");
    const confirmed = confirmProposal(snapshot, proposal, { by: "Ada", prompt: "add two dining chairs", now: "2026-09-25T00:00:00.000Z" });
    const added = confirmed.snapshot.assist?.added.find((item) => item.name === "dining chairs");
    expect(added?.quantity).toBe(2);
    expect(confirmed.snapshot.offers.every((offer) => offer.query !== "dining chairs")).toBe(true);
    expect(confirmed.snapshot.assist?.log[0]).toMatchObject({ by: "Ada", before: "Not on the list" });
    expect(buildReview(confirmed.snapshot).items.find((item) => item.name === "dining chairs")?.priceStatus).toBe("unpriced");
  });

  it("does not change a priced line or a locked measurement", () => {
    const flooring = interpretUtterance("change the flooring to LVP", snapshot).proposal;
    const diff = diffProposal(snapshot, flooring)[0];
    expect(diff?.after).toMatch(/needs price/);
    const changed = confirmProposal(snapshot, flooring, { by: "Ada", prompt: "change the flooring to LVP", now: "2026-09-25T00:00:00.000Z" });
    const line = buildReview(changed.snapshot).items.find((item) => item.name === "LVP");
    expect(line?.price).toBeNull();
    expect(changed.snapshot.offers.find((offer) => offer.query === "Flooring")?.price).toBe(2);
    const locked = interpretUtterance("change the width to 10", snapshot).proposal;
    expect(diffProposal(snapshot, locked)[0]?.blocked).toBe(true);
    const kept = confirmProposal(snapshot, locked, { by: "Ada", prompt: "change the width to 10", now: "2026-09-25T00:00:00.000Z" });
    expect(kept.snapshot.plan.edges).toEqual(snapshot.plan.edges);
    expect(kept.snapshot.assist?.log.at(-1)?.after).toBe("Not changed");
  });

  it("answers a missing price without inventing one", () => {
    const proposal = interpretUtterance("why is the drywall unpriced?", snapshot).proposal;
    expect(proposal.answer).toMatch(/blank/);
    expect(proposal.answer).not.toMatch(/\$/);
    expect(proposal.changes).toEqual([]);
  });

  it("uses the narration without turning it into a price", () => {
    expect(notesFromNarration("The sofa is salvageable. Flooring should be LVP.", ["Sofa"])).toEqual([
      { target: "Sofa", note: "salvageable" },
      { target: "Flooring", note: "LVP" },
    ]);
  });
});

describe("proposeCommand", () => {
  it("does not call the network when the key is missing", async () => {
    const fetchImpl = (() => { throw new Error("network"); }) as typeof fetch;
    const result = await proposeCommand("add two dining chairs", "Kitchen", { env: {}, fetchImpl });
    expect(result).toEqual({ ready: false, proposal: null });
  });

  it("drops a tool call that smuggles a price", async () => {
    const fetchImpl = (async () => Response.json({
      choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify({ intent: "edit", answer: null, unknown: null, changes: [{ op: "add_item", target: "lamp", value: 1, reason: "asked", price: 12 }] }) } }] } }],
    })) as typeof fetch;
    const result = await proposeCommand("add a lamp", "Kitchen", { env: { OPENAI_API_KEY: "sk-test" }, fetchImpl });
    expect(result.ready).toBe(true);
    expect(result.proposal).toBeNull();
  });

  it("keeps a valid tool call for confirm", async () => {
    const fetchImpl = (async () => Response.json({
      choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify({ intent: "edit", answer: null, unknown: null, changes: [{ op: "set_condition", target: "Sofa", value: "salvageable", reason: "You said so." }] }) } }] } }],
    })) as typeof fetch;
    const result = await proposeCommand("mark the sofa as salvageable", "Kitchen", { env: { OPENAI_API_KEY: "sk-test" }, fetchImpl });
    expect(result.proposal?.changes[0]).toMatchObject({ op: "set_condition", value: "salvageable" });
    const confirmed = confirmProposal(snapshot, result.proposal!, { by: "Ada", prompt: "mark the sofa as salvageable", now: "2026-09-25T00:00:00.000Z" });
    expect(buildReview(confirmed.snapshot).items.find((item) => item.name === "Sofa")?.note).toBe("salvageable");
    expect(confirmed.snapshot.offers.find((offer) => offer.query === "Sofa")?.price).toBe(400);
  });
});
