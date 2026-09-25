/** Gap answers may fill a quantity only from dimensions that actually exist. */

export function wallFaceFromAnswers(lengthFt: number | null, heightFt: number | null): { valueSqFt: number | null; status: "estimated" | "unresolved" } {
  if (lengthFt == null || heightFt == null || lengthFt <= 0 || heightFt <= 0) {
    return { valueSqFt: null, status: "unresolved" };
  }
  return { valueSqFt: Math.round(lengthFt * heightFt * 100) / 100, status: "estimated" };
}

export function moistureReadingDoesNotSetArea(): { valueSqFt: null; status: "unresolved"; note: string } {
  return {
    valueSqFt: null,
    status: "unresolved",
    note: "A pin reading does not create square footage. The wet area stays unresolved until it is measured.",
  };
}

export function softFloorScope(answer: "confirmed" | "not_present" | "cant_tell"): {
  included: boolean;
  quantitySqFt: null;
  note: string;
} {
  if (answer === "not_present") {
    return { included: false, quantitySqFt: null, note: "Not present. Left out of the scope." };
  }
  if (answer === "cant_tell") {
    return { included: false, quantitySqFt: null, note: "Still suspected. Not scoped, and not given the whole room's area." };
  }
  return {
    included: true,
    quantitySqFt: null,
    note: "Present. The quantity stays open until the affected area is measured. The whole room is not substituted.",
  };
}
