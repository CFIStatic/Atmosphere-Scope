"use client";

import { useState, type ReactNode } from "react";

export function FieldPair({ sketch, items }: { sketch: ReactNode; items: ReactNode }) {
  const [tab, setTab] = useState<"sketch" | "items">("sketch");
  return (
    <div className="field-pair" data-tab={tab}>
      <div className="segment" role="tablist" aria-label="Sketch or items">
        <button type="button" role="tab" aria-selected={tab === "sketch"} onClick={() => setTab("sketch")}>Sketch</button>
        <button type="button" role="tab" aria-selected={tab === "items"} onClick={() => setTab("items")}>Items</button>
      </div>
      <div className="field-sketch">{sketch}</div>
      <div className="field-items">{items}</div>
    </div>
  );
}
