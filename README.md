# Atmosphere Scope

Standalone prototype that turns a narrated residential walkthrough into an editable 2D sketch, a labeled 3D schematic, an evidence-backed assessment, and a draft mitigation / rebuild estimate.

AI output stays **Draft—requires estimator review** until a person marks it reviewed and then approves it. Customer authorization is a separate step and names the exact version.

## Setup

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Jobs are stored as JSON in `data/` (gitignored). Uploaded media stays in `data/media` and is served only through the job route.

## What is implemented

- Job file with property, customer, concern, floors, rooms, media, findings, sketch, questions, scope, and estimate versions.
- Sample walkthroughs: multi-room water loss, no visible damage, incomplete footage, and an interrupted pipeline you can retry.
- Narration is screened for instruction-like language and stored as evidence. It cannot approve an estimate or set a price.
- Findings keep observed, reported, suspected, contradicted, and insufficient evidence apart. Staining does not become mold or an active leak.
- 2D sketch editor with undo/redo, locked dimensions, and measurement / damage / scope overlays. Scale is claimed only when every required dimension is locked and consistent.
- **3D map** extruded from that sketch. See below.
- Deterministic quantities and an illustrative price book labeled “Illustrative—not a customer quote.” Markup and margin are never applied together.
- Geometry edits preview quantity changes. Approved versions are not overwritten; a draft revision is opened instead.
- PDF, CSV, SVG, and JSON export.

## 3D map

The map is a volume model of the rooms already inferred from the walkthrough:

- Plan shapes come from narration, frame notes, and any dimensions you lock. They are not a photogrammetric mesh of the video.
- Spoken ceiling heights are provisional until you lock them.
- Rooms with no height are drawn at 8 ft **for viewing only**. That number is not saved as a measurement and does not enter quantities.
- Solid, translucent, and wireframe volumes match confirmed, provisional, and unmeasured heights. Labels repeat that status so it is not color alone.
- Damage and opening markers use the same findings as the assessment.

True video reconstruction (SLAM, dense depth, or a vision model that returns a mesh) is an integration boundary. `src/analysis/providers.ts` is where a transcription or frame provider would plug in. `src/spatial/model.ts` only extrudes the structured sketch.

## Limitations

- No live speech-to-text or vision API is connected. Samples ship transcripts and frame notes. Your own clips can be uploaded and paired with pasted narration; frames are not invented.
- The demo price book is fictional. There is no Xactimate or regional price feed.
- The app has no login. Media paths are unlisted, not a production access-control model.
- Depth files in `atmosphere-depth-v1` (see `samples/atmosphere-depth-v1.json`) import as inferred geometry. Other depth formats are stored only. See `docs/INTEGRATION.md` for the seams a later Atmosphere port would replace.
- This is not a certified survey, moisture map, or structural opinion.

## Layout

- `src/domain` — geometry, quantities, pricing, scope, review. No React.
- `src/analysis` — evidence rules and the staged pipeline.
- `src/spatial` — 3D schematic built from the sketch.
- `src/app` — demo UI and HTTP routes.
- `src/samples` — scripted walkthroughs.
