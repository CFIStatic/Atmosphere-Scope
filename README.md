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

The minimum setup for the full walkthrough is one key: `OPENAI_API_KEY`. Copy `.env.example`. Measurement and local storage run with no key at all. SerpAPI, Replicate, Modal, and Supabase are optional adapters. A key for one of those does not turn it on by itself.

| Stage | Variable | Provider | Approx cost |
| --- | --- | --- | --- |
| Measurement, calibration PDF, plane fit | none | Local OpenCV (`measure/requirements.txt`) and ffmpeg | $0 |
| Transcription | `OPENAI_API_KEY` | `gpt-4o-mini-transcribe` (override with `OPENAI_TRANSCRIBE_MODEL`; `whisper-1` is about $0.006/min) | a few tenths of a cent per minute |
| Object identification | `OPENAI_API_KEY` | `gpt-4o-mini` vision, at most 4 keyframes | typically under about $0.01 per keyframe |
| Replacement price | `OPENAI_API_KEY` | Responses API `web_search`, then a server fetch of the product page | billed per search, often cents per item plus tokens |
| Storage | none | JSON and files in `data/` | $0 |

There is no fixed per-video dollar total. Web search is slower and usually more expensive than a shopping API, and many retailer pages block the server fetch, so a lot of prices stay **unverified**. An unverified price is not a quote. If search returns no price, the price stays blank. Nothing is invented.

Optional later: `PRICING_PROVIDER=serpapi` plus `SERPAPI_API_KEY` (about $0.01–$0.02 per item). `MEASUREMENT_BACKEND=replicate` or `modal` is recorded as a request only. This build still measures with local OpenCV and does not call a GPU host. `STORAGE=supabase` is documented in `docs/STORAGE.md`.

### CPU time

Measured on this host (Linux x86_64, OpenCV 5.0.0, no GPU). See `eval/cpu-timing.json`.

| Run | Time |
| --- | --- |
| `from_video` on each synthetic walkthrough clip (8 frames after 2 fps sampling) | **0.73–0.85 s** wall clock, of which about 0.59–0.63 s is the solve |
| Solver on the 16-frame JPEG set for the 12×14 room (the frame cap) | **1.1 s** |

A longer video does not get a longer solve. Sampling is `fps=2` and stops after 16 frames, which is about the first 8 seconds. That keeps CPU time near a second on this machine and also means the solver never sees the rest of a long walk. A GPU multi-view model could be faster or more complete on a long clip. Those models were not run, and this configuration does not require one.

### OpenAI-only tradeoffs

- The sheet solve is the measurement. Vision can mis-name objects. Speech-to-text can mis-hear. Neither one measures the room, and neither one confirms a dimension.
- Web search can return a stale or wrong offer. The server keeps a price as verified only when that price text is on the product page. Failed fetches and mismatched pages stay unverified. Bot walls are common.
- The ±5% target is not met for floor area on the synthetic rooms, because the error bound is the sum of the wall bounds and landed at 5.2–5.3%. The 9 ft ceiling stayed unresolved. The 2.6% wall-error floor was tuned on these same synthetic cases. No tape-measured house is in the set, so this is not a 95% claim.
- Door-prior scale and WebXR do not meet ±5% here. WebXR has no harness result. Relative monocular depth is not used as metric.
- Local CPU is cheap and needs no GPU key. It is also limited to a close, readable ChArUco sheet and a short frame cap. It is slower and less complete than a hosted multi-view model would be, and that comparison was not measured.

## Setup

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Jobs are stored as JSON in `data/` (gitignored). Uploaded media stays in `data/media` and is served only through the job route. To use Supabase instead, set `STORAGE=supabase` plus the project URL and secret key, and run the SQL in `docs/STORAGE.md`. Missing Supabase settings are an error. The app does not silently keep writing to disk.

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

- Speech-to-text, vision, and replacement search run only when `OPENAI_API_KEY` is set. Samples still ship transcripts and frame notes. A missing key or a failed call leaves narration, objects, and prices blank.
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
