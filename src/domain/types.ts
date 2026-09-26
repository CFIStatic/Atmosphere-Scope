export type SketchState = "provisional_layout" | "partially_measured" | "measurement_confirmed";
export type ScaleClaim = "not_to_scale" | "to_scale";
export type QuantityStatus = "confirmed" | "provisional" | "unresolved";
export type ProvenanceKind = "inferred" | "reported" | "confirmed" | "user_corrected" | "imported";
export type Phase = "mitigation" | "rebuild";
export type ScopeClass = "supported" | "conditional" | "optional" | "excluded";
export type EstimateStatus =
  | "ai_draft"
  | "estimator_reviewed"
  | "estimator_approved"
  | "customer_authorized"
  | "superseded";

export type EvidenceClass =
  | "observed_condition"
  | "reported_condition"
  | "suspected_cause"
  | "confirmed_measurement"
  | "confirmed_test"
  | "proposed_work"
  | "unresolved_question"
  | "no_visible_issue"
  | "no_work_recommended"
  | "insufficient_evidence"
  | "contradiction";

export type Point = { x: number; y: number };

export type Actor = {
  name: string;
  role: "estimator" | "customer" | "system" | "ai";
};

export type EvidenceRef = {
  mediaId: string;
  startMs?: number;
  endMs?: number;
  frameId?: string;
  transcriptSegmentId?: string;
  note?: string;
};

export type Floor = {
  id: string;
  name: string;
  level: number;
};

export type Room = {
  id: string;
  floorId: string;
  name: string;
  nameStatus: "confirmed" | "inferred";
  humanNamed: boolean;
  notes: string;
};

export type SurfaceKind = "floor" | "ceiling" | "wall" | "opening" | "fixture" | "assembly";

export type Surface = {
  id: string;
  roomId: string;
  kind: SurfaceKind;
  label: string;
  edgeIndex?: number;
  material: string | null;
  materialStatus: "confirmed" | "reported" | "unknown";
};

export type MediaKind = "video" | "photo" | "floor_plan" | "depth" | "audio";

export type MediaAsset = {
  id: string;
  kind: MediaKind;
  filename: string;
  mimeType: string;
  byteSize: number;
  storageKey: string | null;
  roomId: string | null;
  label: string;
  createdAt: string;
  durationMs?: number;
  note?: string;
};

export type TranscriptSegment = {
  id: string;
  mediaId: string;
  startMs: number;
  endMs: number;
  text: string;
  speaker: "narrator" | "unknown";
  injectionFlags: string[];
  source: "asr" | "user_supplied" | "sample";
};

export type VisualFeature =
  | "standing_water"
  | "wet_surface"
  | "staining"
  | "discoloration"
  | "peeling_finish"
  | "swelling"
  | "open_cavity"
  | "debris"
  | "no_visible_issue"
  | "obscured"
  | "door"
  | "window"
  | "fixture"
  | "transition"
  | "ceiling"
  | "floor"
  | "wall";

export type CoverageBeat = "wide" | "corners" | "walls" | "ceiling" | "floor" | "openings" | "closeup" | "transition";

export type FrameObservation = {
  id: string;
  mediaId: string;
  timeMs: number;
  roomHint: string | null;
  features: VisualFeature[];
  coverage: CoverageBeat[];
  note: string;
  source: "vision_model" | "human" | "sample";
};

export type Finding = {
  id: string;
  roomId: string | null;
  floorId: string | null;
  surfaceId: string | null;
  locationNote: string;
  material: string | null;
  evidenceClass: EvidenceClass;
  title: string;
  observableCondition: string | null;
  narratorReport: string | null;
  interpretation: string | null;
  uncertainty: string | null;
  requiredFollowUp: string | null;
  proposedNextAction: string | null;
  justification: string | null;
  evidence: EvidenceRef[];
  origin: "ai" | "human";
  humanCorrected: boolean;
  correctedFields: string[];
  fingerprint: string;
  createdAt: string;
};

export type SketchRoom = {
  id: string;
  roomId: string;
  polygon: Point[];
  provenance: ProvenanceKind;
  incomplete: boolean;
  incompleteReason?: string;
  labelOffset?: Point;
};

export type SketchOpening = {
  id: string;
  roomId: string;
  edgeIndex: number;
  kind: "door" | "window";
  offsetFt: number;
  widthFt: number | null;
  heightFt: number | null;
  connectsToRoomId: string | null;
  connectionStatus: "confirmed" | "inferred" | "unresolved" | "none";
  provenance: ProvenanceKind;
};

export type SketchFixture = {
  id: string;
  roomId: string;
  kind: string;
  label: string;
  at: Point;
  provenance: ProvenanceKind;
};

export type SketchAnnotation = {
  id: string;
  roomId: string | null;
  findingId: string | null;
  text: string;
  at: Point;
  provenance: ProvenanceKind;
};

export type DimensionTarget =
  | { type: "edge"; roomId: string; edgeIndex: number }
  | { type: "height"; roomId: string };

export type SketchDimension = {
  id: string;
  target: DimensionTarget;
  valueFt: number | null;
  status: "confirmed" | "inferred" | "conflicting" | "unresolved";
  locked: boolean;
  provenance: ProvenanceKind;
  sourceNote: string;
};

export type SketchSnapshot = {
  rooms: SketchRoom[];
  openings: SketchOpening[];
  fixtures: SketchFixture[];
  annotations: SketchAnnotation[];
  dimensions: SketchDimension[];
};

export type SketchDocument = {
  id: string;
  units: "ft";
  state: SketchState;
  scaleClaim: ScaleClaim;
  scaleClaimReason: string;
  ceilingHeights: Record<string, { valueFt: number | null; status: QuantityStatus; provenance: ProvenanceKind; sourceNote: string }>;
  geometry: SketchSnapshot;
  undo: SketchSnapshot[];
  redo: SketchSnapshot[];
  disclaimer: string;
};

export type Quantity = {
  value: number | null;
  unit: "sqft" | "lf" | "each" | "hr" | "cf";
  status: QuantityStatus;
  formula: string | null;
  sourceNote: string;
  geometryRefs: string[];
};

export type ScopeItem = {
  id: string;
  code: string;
  phase: Phase;
  scopeClass: ScopeClass;
  roomId: string | null;
  surfaceId: string | null;
  findingIds: string[];
  description: string;
  location: string;
  reason: string;
  assumptions: string[];
  exclusions: string[];
  dependencies: string[];
  quantity: Quantity;
  reviewStatus: "draft" | "edited" | "accepted";
  humanEdited: boolean;
  origin: "ai" | "human";
  fingerprint: string;
  /** Inventoried object this line was scoped from, when the line came from object analysis. */
  objectId?: string | null;
  /** High-confidence lines are proposed. Low-confidence lines are suggested and need acceptance. */
  proposal?: "proposed" | "suggested";
  /** Model confidence for this line, 0–1. Not a measurement-accuracy claim. */
  confidence?: number | null;
};

export type PriceComponent = {
  labor: number;
  material: number;
  equipment: number;
  disposal: number;
};

export type PriceBookItem = {
  code: string;
  phase: Phase;
  description: string;
  unit: Quantity["unit"];
  cost: PriceComponent;
  minimumCharge: number;
  taxable: boolean;
};

export type PriceBook = {
  id: string;
  name: string;
  currency: "USD";
  illustrative: boolean;
  disclaimer: string;
  items: PriceBookItem[];
};

export type PricingSettings = {
  currency: "USD";
  locationName: string;
  locationFactor: number;
  overheadPercent: number;
  mode: "markup" | "margin";
  markupPercent: number;
  marginPercent: number;
  taxRate: number;
  taxBase: "none" | "materials" | "all";
  wasteFactor: number;
  deductOpenings: boolean;
};

export type PricedLine = {
  scopeItemId: string;
  unitCost: number | null;
  unitPrice: number | null;
  directCost: number | null;
  overhead: number | null;
  extendedPrice: number | null;
  tax: number | null;
  minimumApplied: boolean;
  pricingSource: string;
  unpricedReason: string | null;
};

export type EstimateAdjustment = {
  id: string;
  label: string;
  amount: number;
  kind: "overhead" | "tax" | "other";
};

export type EstimateTotals = {
  label: "partial" | "provisional" | "complete";
  mitigationSubtotal: number;
  rebuildSubtotal: number;
  conditionalAllowance: number;
  optionalAllowance: number;
  excludedCount: number;
  overhead: number;
  tax: number;
  supportedTotal: number;
  combinedWithAllowances: number;
  currency: "USD";
  unresolvedLineIds: string[];
};

export type EstimateVersion = {
  id: string;
  number: number;
  status: EstimateStatus;
  parentVersionId: string | null;
  changeRequest: string | null;
  scopeItemIds: string[];
  pricedLines: PricedLine[];
  totals: EstimateTotals;
  settings: PricingSettings;
  priceBookId: string;
  priceBookLabel: string;
  assumptions: string[];
  exclusions: string[];
  createdAt: string;
  createdBy: Actor;
  reviewedAt: string | null;
  reviewedBy: Actor | null;
  approvedAt: string | null;
  approvedBy: Actor | null;
  authorizedAt: string | null;
  authorizedBy: Actor | null;
  authorizationStatement: string | null;
};

export type FollowUpQuestion = {
  id: string;
  priority: number;
  prompt: string;
  why: string;
  dependsOn: { findingIds: string[]; scopeItemIds: string[]; dimensionIds: string[] };
  status: "open" | "answered" | "waived";
  answer: string | null;
  answerKind: "text" | "measurement" | "photo" | "test" | null;
  answeredAt: string | null;
};

export type ObjectCategory =
  | "drywall"
  | "ceiling"
  | "baseboard"
  | "trim"
  | "casing"
  | "door"
  | "window"
  | "flooring"
  | "cabinet"
  | "countertop"
  | "fixture"
  | "outlet"
  | "switch"
  | "vent"
  | "light"
  | "hvac"
  | "plumbing"
  | "appliance"
  | "contents"
  | "furniture"
  | "other";

export type ObjectCondition = "ok" | "damaged" | "unclear";

export type DamageType =
  | "water_staining"
  | "swelling"
  | "delamination"
  | "mold"
  | "cracking"
  | "burn"
  | "smoke"
  | "missing"
  | "wet";

export type DamageSeverity = "none" | "minor" | "moderate" | "severe";

/** Normalized to the full frame. Origin is the top left. Values are 0–1. */
export type BoundingBox = { x: number; y: number; width: number; height: number };

export type ObjectSighting = {
  mediaId: string;
  frameId: string;
  timeMs: number;
  box: BoundingBox;
  /** Null on the full frame. Set when the sighting came from a crop. */
  tile: string | null;
};

export type ObjectExtent = {
  value: number | null;
  unit: "sqft" | "lf" | "each" | "ft" | null;
  note: string;
  /** Spoken wet height, when the narrator gave one. */
  heightFt?: number | null;
  /** Spoken run length, when the narrator gave one. */
  lengthFt?: number | null;
};

export type DamageAssessment = {
  condition: ObjectCondition;
  damageTypes: DamageType[];
  severity: DamageSeverity | null;
  extent: ObjectExtent;
  transcriptQuote: string | null;
  transcriptStartMs: number | null;
  confidence: number;
  rationale: string;
};

export type RoomObject = {
  id: string;
  roomId: string | null;
  roomName: string;
  category: ObjectCategory;
  label: string;
  material: string | null;
  condition: ObjectCondition;
  quantity: { value: number | null; unit: "sqft" | "lf" | "each"; source: "geometry" | "narration" | "count" | "unmeasured"; note: string };
  confidence: number;
  sightings: ObjectSighting[];
  assessment: DamageAssessment;
  /** Model id that assessed this object. Older jobs omit it. */
  assessedBy?: string | null;
};

export type AnalysisEscalationCounts = {
  mode: "cascade" | "strong" | "cheap";
  triaged: number;
  escalated: number;
  narration: number;
  audit: number;
  keptOk: number;
};

export type AnalysisStageCost = {
  stage: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedUsd: number;
};

export type AnalysisCostLog = {
  walkthroughMediaId: string | null;
  durationSeconds: number | null;
  stages: AnalysisStageCost[];
  totalEstimatedUsd: number;
  note: string;
  /** How many objects stayed on triage and how many went to the strong model. */
  escalation?: AnalysisEscalationCounts | null;
};

export type AuditEvent = {
  id: string;
  at: string;
  actor: Actor;
  action: string;
  detail: string;
};

export type ProcessingStage =
  | "ingest"
  | "transcribe"
  | "frames"
  | "analyze"
  | "layout"
  | "questions"
  | "scope"
  | "estimate";

export type StageState = {
  status: "pending" | "complete" | "failed" | "skipped";
  completedAt: string | null;
  message: string | null;
};

export type ProcessingState = {
  status: "idle" | "running" | "failed" | "complete" | "partial";
  runId: string | null;
  stages: Record<ProcessingStage, StageState>;
  lastError: string | null;
};

export type PendingQuantityChange = {
  scopeItemId: string;
  previous: Quantity;
  proposed: Quantity;
  reason: string;
};

export type Job = {
  id: string;
  orgId?: string | null;
  createdAt: string;
  updatedAt: string;
  property: {
    address: string;
    city: string;
    region: string;
    postalCode: string;
    propertyType: "residential_interior";
  };
  customer: { name: string; phone: string; email: string };
  concern: string;
  floors: Floor[];
  rooms: Room[];
  surfaces: Surface[];
  media: MediaAsset[];
  transcripts: TranscriptSegment[];
  frames: FrameObservation[];
  findings: Finding[];
  objects: RoomObject[];
  analysisCost: AnalysisCostLog | null;
  sketch: SketchDocument;
  questions: FollowUpQuestion[];
  scopeItems: ScopeItem[];
  estimates: EstimateVersion[];
  activeEstimateId: string | null;
  pendingQuantityChanges: PendingQuantityChange[];
  processing: ProcessingState;
  audit: AuditEvent[];
  coverageNotes: string[];
};

export const SKETCH_DISCLAIMER =
  "Suggested schematic for scoping and estimating. Not a certified survey or construction drawing.";

export const DRAFT_BANNER = "Draft—requires estimator review";
