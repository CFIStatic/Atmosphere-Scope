import { createId, nowIso } from "@/domain/ids";
import type { Job } from "@/domain/types";

export const DRAFT_CUSTOMER = "Untitled";

export function draftJobInput() {
  return {
    address: "",
    city: "",
    region: "",
    postalCode: "",
    customerName: DRAFT_CUSTOMER,
    phone: "",
    email: "",
    concern: "Walkthrough",
  };
}

const STREET = /\b(\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,5}(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Place|Pl|Circle|Cir|Trail|Trl))\b/i;

export function suggestFromNarration(transcript: string | null): { name: string | null; address: string | null } {
  if (!transcript?.trim()) return { name: null, address: null };
  const address = tidy(transcript.match(STREET)?.[1] ?? "");
  const named = transcript.match(/\b(?:job|claim|file)\s+(?:is\s+called|is\s+named|called|named)\s+["']?([A-Za-z0-9][^.\n]{1,48})/i);
  let name = named ? tidy(named[1].replace(/["']$/, "").split(/\s+(?:and|at|with|for)\s+/i)[0] ?? "") : "";
  if (name.length < 2) name = "";
  if (address && name.toLowerCase().includes(address.toLowerCase())) name = "";
  return { name: name || null, address: address || null };
}

export type JobLocation = { lat: number; lng: number };

export function applyJobIdentity(job: Job, input: {
  address?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  customerName?: string | null;
  location?: JobLocation | null;
}): Job {
  const property = { ...job.property };
  const customer = { ...job.customer };
  if (typeof input.address === "string") property.address = input.address.trim();
  if (typeof input.city === "string") property.city = input.city.trim();
  if (typeof input.region === "string") property.region = input.region.trim();
  if (typeof input.postalCode === "string") property.postalCode = input.postalCode.trim();
  if (typeof input.customerName === "string" && input.customerName.trim()) customer.name = input.customerName.trim();
  let coverageNotes = job.coverageNotes;
  const location = input.location;
  if (location && Number.isFinite(location.lat) && Number.isFinite(location.lng)) {
    const note = `Location ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
    coverageNotes = coverageNotes.some((item) => item.startsWith("Location "))
      ? coverageNotes.map((item) => (item.startsWith("Location ") ? note : item))
      : [...coverageNotes, note];
  }
  return {
    ...job,
    property,
    customer,
    coverageNotes,
    updatedAt: nowIso(),
    audit: [...job.audit, {
      id: createId("aud"),
      at: nowIso(),
      actor: { name: "System", role: "system" },
      action: "job_named",
      detail: "Name or address updated after the recording.",
    }],
  };
}

function tidy(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[.,;:]+$/, "").trim();
}
