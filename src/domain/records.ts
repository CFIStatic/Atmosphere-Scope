import type { WalkthroughSnapshot } from "@/capture/snapshot";

export type ApprovalStatus = "open" | "estimator_approved" | "customer_authorized";

export type WalkthroughRecord = {
  id: string;
  updatedAt: string;
  snapshot: WalkthroughSnapshot;
  videoKey: string | null;
  approval: {
    status: ApprovalStatus;
    approvedBy: string | null;
    approvedAt: string | null;
    authorizedBy: string | null;
    authorizedAt: string | null;
    statement: string | null;
  };
};

export function openRecord(id: string, snapshot: WalkthroughSnapshot, videoKey: string | null, updatedAt: string): WalkthroughRecord {
  return {
    id,
    updatedAt,
    snapshot,
    videoKey,
    approval: { status: "open", approvedBy: null, approvedAt: null, authorizedBy: null, authorizedAt: null, statement: null },
  };
}

export function saveRecord(current: WalkthroughRecord, snapshot: WalkthroughSnapshot, videoKey: string | null, updatedAt: string): WalkthroughRecord {
  if (current.approval.status !== "open" && numbersOf(current) !== numbersOf({ ...current, snapshot, videoKey })) {
    throw new Error("This version is locked. It was not changed.");
  }
  if (current.approval.status !== "open") return current;
  return { ...current, updatedAt, snapshot, videoKey };
}

export function approveRecord(current: WalkthroughRecord, actor: string, at: string): WalkthroughRecord {
  if (current.snapshot.finalReport?.status !== "final") throw new Error("Finalize the estimate before approval. The numbers were not locked.");
  if (current.approval.status === "customer_authorized") throw new Error("This version is locked. It was not changed.");
  if (current.approval.status === "estimator_approved") return current;
  return {
    ...current,
    updatedAt: at,
    approval: { ...current.approval, status: "estimator_approved", approvedBy: actor, approvedAt: at },
  };
}

export function authorizeRecord(current: WalkthroughRecord, actor: string, statement: string, at: string): WalkthroughRecord {
  const text = statement.trim();
  if (!text) throw new Error("Customer authorization needs a statement. The version was not changed.");
  if (current.approval.status !== "estimator_approved") throw new Error("Customer authorization follows estimator approval. This version was not authorized.");
  return {
    ...current,
    updatedAt: at,
    approval: { ...current.approval, status: "customer_authorized", authorizedBy: actor, authorizedAt: at, statement: text },
  };
}

function numbersOf(record: Pick<WalkthroughRecord, "snapshot" | "videoKey">): string {
  const report = record.snapshot.finalReport;
  return JSON.stringify({
    videoKey: record.videoKey,
    quantities: record.snapshot.plan.quantities,
    edges: record.snapshot.plan.edges.map((edge) => [edge.roomId, edge.edgeIndex, edge.valueFt, edge.status]),
    heights: record.snapshot.plan.ceilingHeights,
    report: report
      ? {
          id: report.id,
          catalog: report.catalogVersionId,
          rates: report.rateBookId,
          lines: report.lines.map((line) => [line.room, line.code, line.quantity, line.lineTotal]),
        }
      : null,
  });
}
