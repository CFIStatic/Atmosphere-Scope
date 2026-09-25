# Atmosphere Scope

Standalone prototype that turns a narrated residential walkthrough into an editable 2D sketch, a labeled 3D schematic, an evidence-backed assessment, and a draft mitigation / rebuild estimate.

AI output stays **Draft—requires estimator review** until a person marks it reviewed and then approves it. Customer authorization is a separate step and names the exact version.

Room measurement is a separate, local pipeline. It does **not** claim 95% accuracy. The numbers below are what `npm run eval:accuracy` last recorded on synthetic rooms. See [Accuracy](/accuracy) in the running app, or `eval/report.json`.

## Measurement

Print `GET /api/calibration-target` at 100% scale (US Letter, no fit-to-page). The sheet is a 5×7 ChArUco board, dictionary 4×4, 30 mm squares, 22 mm markers. During the walk the phone stays close enough for those markers to resolve, in portrait, with the sheet in the lower frame, and sweeps far enough to show each wall and the ceiling line.

The solver calibrates the camera from the sheet (it is not given the true intrinsics), poses each keyframe, fits floor lines that bracket the camera, and takes ceiling height only from a sharp upper edge. Each dimension carries an error bound. Above 5%, or when the ceiling edge is not stable, the value does not meet the target and is not shown as confirmed. A tape or a laser lock is the only confirmation, and only when it agrees with the other metric source within 5%.

### What the harness measured

Synthetic pinhole rooms (JPEG, radial distortion). Truth is the mesh. This is not a tape-measured house.

| Case | Method | Result |
| --- | --- | --- |
| 12×14×8 ft, 10.5×11.75×9 ft, 15×12.5×8.5 ft | ChArUco multi-view | Wall lengths: worst actual error **2.38%**. All six walls were inside their error bars and marked as meeting ±5%. |
| Same three rooms | ChArUco | Ceiling: 7.99 ft vs 8 (0.16%) and 8.37 ft vs 8.5 (1.51%), both marked as meeting. The 9 ft room did **not** produce a stable ceiling edge, so height stayed unresolved instead of being forced. |
| Same three rooms | ChArUco | Floor area actual error was 0.78%, 0.98%, and 3.41%. The error bound is the sum of the wall bounds and landed at 5.2–5.3%, so **area was not marked as meeting ±5%**. |
| Same videos, scale taken as an 80 in door prior | Door prior | Geometry can be close. The prior is treated as ±8% or wider, so nothing meets the target. |
| Same room, sheet omitted | No target | Every dimension stays unresolved. |

WebXR, Bluetooth lasers, COLMAP, and learned multi-view models (DUSt3R / MASt3R / VGGT) were **not run**. Monocular relative depth is not used as a metric method. No real tape-measured video is in the set, so this is not a 95% claim.

### Keys and cost

| Stage | Variable | Provider | Approx cost |
| --- | --- | --- | --- |
| Measurement, calibration PDF, plane fit | none | Local OpenCV (`measure/requirements.txt`) and ffmpeg | $0 |
| Transcription | `OPENAI_API_KEY` | Whisper | about $0.006 per minute |
| Object identification | `OPENAI_API_KEY` | gpt-4o-mini vision | about $0.01 per keyframe |
| Replacement price | `SERPAPI_API_KEY` | SerpAPI Google Shopping | about $0.01–$0.02 per item |

A two-minute video with 15 keyframes and 8 priced items is on the order of **$0.30** if those keys are set. Measurement itself stays $0. Missing keys leave narration, objects, and prices blank. They are not invented. Copy `.env.example`.

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

The 3D map still extrudes the sketch. Metric room spans come from `measure/`, which is the ChArUco pipeline above, not from this extrusion. `src/spatial/model.ts` does not turn an 8 ft viewing height into a saved measurement.

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
