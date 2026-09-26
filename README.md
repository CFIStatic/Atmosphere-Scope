# Atmosphere Scope

Atmosphere Scope is its own estimating system. After a walkthrough is processed, the app opens a priced, evidence-linked contents list with the sketch beside it. Video measurement and an imported floor plan supply quantities. They are supporting inputs, not the landing screen.

The estimate is produced here. The draft scope and estimate screen maps findings and sketch quantities onto a versioned line-item catalog, then prices each component from a recorded source. Materials use the replacement-price check. Labor uses an editable regional rate table. Equipment uses an editable rate table. Overhead, profit, tax, and region are settings on that rate book. A component without a source and a date stays blank. A line with any blank component has no line total. Finalize estimate locks the report to the catalog version and rate book it used. Send report downloads that report as a web view, PDF, CSV, or JSON (`atmosphere.estimate.v1`). See [docs/ESTIMATE.md](docs/ESTIMATE.md).

Each contents line keeps its evidence. A material price stays unverified until the product page is checked. The report stays a draft until it is finalized. Estimator approval and customer authorization remain separate steps and name the exact version.

Room measurement does **not** claim 95% accuracy. The numbers below are what `npm run eval:accuracy` last recorded on synthetic rooms. See [Accuracy](/accuracy) in the running app, or `eval/report.json`.

Floor plans from tools restorers already use can be imported when the format is openly documented. See [docs/IMPORTS.md](docs/IMPORTS.md). Imported lengths are marked imported. They are not a tape confirmation. If a video measurement of the same room exists, the two are compared and neither value is replaced. A proprietary sketch file that does not publish an open schema is not imported.

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
| Object identification | `OPENAI_API_KEY` | `gpt-4o-mini` vision. The older notes path reads at most 4 keyframes. The exhaustive inventory reads distinct frames and 2×2 crops, with a safety ceiling of 120 frames | about $0.02–$0.04 per walkthrough minute at ~12 distinct frames; a busy camera near 60 frames is closer to $0.10/min plus transcription |
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

Open [http://localhost:3000](http://localhost:3000). Jobs are stored as JSON in `data/` (gitignored). Uploaded media stays in `data/media` and is served only through the job route. To use Supabase instead, set `STORAGE=supabase` plus the project URL and secret key, and apply `supabase/migrations/20260925160000_jobs_shares_rls.sql` and `supabase/migrations/20260926180000_analysis_job_lease.sql`. Missing Supabase settings are an error. The app does not silently keep writing to disk. The analysis lease table is the durable queue for video inventory. Without Supabase, the same queue is `data/analysis-jobs.json`.

## Continuous integration

`.github/workflows/ci.yml` runs on push, pull request, and manual dispatch. It runs the unit tests and `python3 -m measure.eval_harness` on the synthetic cases in `eval/cases`, then uploads `eval/report.json` as the `accuracy-report` artifact and writes the same table to the job summary. That report is still synthetic. It is not a 95% claim.

Real vision, transcription, and web-search pricing run only in the `providers` job. That job uses the GitHub environment `Atmosphere / production` and reads `secrets.OPENAI_API_KEY` from it. The workflow does not print the key. If the secret is missing, including on a fork pull request, that job skips the live calls and still succeeds. `npm run test:providers` is the same live suite. Without the key it skips. `OPENAI_PROVIDER_FIXTURES=1 npm run test:providers` replays the recorded responses in `fixtures/providers/` and does not call OpenAI.

The capture page is a web app. It records with a weak or missing signal, stores chunks in IndexedDB, and uploads them when the browser is online again. The upload status is on the page. Measurement, vision, and price checks stay on the server. Price checks fetch only the product URL from the search result, refuse private and metadata addresses after DNS, and cache a lookup by item name for `PRICE_CACHE_TTL_SECONDS` (default 6 hours). A blocked or unreadable page stays unverified.

## Railway

Deploy this Dockerfile. A default Railpack image does not include Python, OpenCV, or ffmpeg, and the room solver needs all three. `railway.toml` selects the Dockerfile and checks `GET /`.

Set variables on the Railway service. Do not use `NEXT_PUBLIC_` for any key, and do not bake keys into the image.

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | for transcription, objects, and prices | Server only. Measurement still runs without it. |
| `DATA_DIR` | yes, when using a volume | Set to `/data`. |
| `PRICE_CACHE_TTL_SECONDS` | no | Default `21600`. |
| `PRICE_FETCH_MIN_INTERVAL_MS` | no | Default `1000`. |
| `PRICE_FETCH_TIMEOUT_MS` | no | Default `8000`. |
| `PRICE_FETCH_MAX_BYTES` | no | Default `500000`. |
| `PRICING_PROVIDER`, `SERPAPI_API_KEY` | no | SerpAPI only when both are set. |
| `STORAGE`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | for hosted jobs, walkthroughs, catalog, and video | See below. `SUPABASE_SECRET_KEY` may replace the service role key. |
| `SUPABASE_ANON_KEY`, `SITE_URL` | for Supabase sign-in | Server only. Required with `STORAGE=supabase`. See `docs/AUTH.md`. |

Add a volume mounted at `/data` and set `DATA_DIR=/data`. Railway's container disk is ephemeral. The volume holds in-progress capture chunks. With local storage it also holds job JSON, media, walkthroughs, and the catalog. The phone still has its copy of a capture in IndexedDB and can upload again.

To keep finished jobs, walkthroughs, the catalog, and video in Supabase, set `STORAGE=supabase` plus the URL and secret key, and apply `supabase/migrations/20260925160000_jobs_shares_rls.sql` and `supabase/migrations/20260926180000_analysis_job_lease.sql`. The bucket stays private. Chunks for a capture that is still uploading remain under `DATA_DIR/uploads` until the server stores the finished video, so the volume is still the scratch space. The service role key stays a service variable. It is not sent to the browser. `ANALYSIS_LEASE_MS` is optional (default 120000) and is not required for a deploy.

These are the variables to set on the Railway service before a hosted deploy. Values are not listed here.

| Needed for | Variables |
| --- | --- |
| Measurement only | `DATA_DIR=/data`, and a volume at `/data` |
| Transcription, objects, and prices | `OPENAI_API_KEY` |
| Supabase database and private video | `STORAGE=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` |
| Supabase sign-in | `SUPABASE_ANON_KEY`, `SITE_URL`, redirect URLs, and custom SMTP. The first admin is `scripts/create-admin.mjs`. See `docs/AUTH.md`. |

## What is implemented

- Job file with property, customer, concern, floors, rooms, media, findings, sketch, questions, scope, and estimate versions.
- A saved walkthrough keeps its video, finalized report, and approval. Estimator approval locks the numbers. Customer authorization is a separate sign-in.
- Sample walkthroughs: multi-room water loss, no visible damage, incomplete footage, and an interrupted pipeline you can retry.
- Narration is screened for instruction-like language and stored as evidence. It cannot approve an estimate or set a price.
- Findings keep observed, reported, suspected, contradicted, and insufficient evidence apart. Staining does not become mold or an active leak.
- 2D sketch editor with undo/redo, locked dimensions, and measurement / damage / scope overlays. Scale is claimed only when every required dimension is locked and consistent.
- **3D map** extruded from that sketch. See below.
- A versioned mitigation and rebuild catalog, and a regional labor and equipment rate book. Sample jobs still include illustrative arithmetic labeled “Illustrative—not a customer quote.” That arithmetic is not the estimate.
- Geometry edits preview quantity changes. Approved versions are not overwritten; a draft revision is opened instead.
- The estimate report is a web view plus PDF, CSV, and JSON (`atmosphere.estimate.v1`). A job file can also send its own PDF, CSV, SVG, and JSON.

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
- Materials price only when a sourced offer exists. Labor and equipment stay unpriced until an admin enters a rate, with a source and a date. A finalized report does not recompute when those rates change. Sample jobs can still show illustrative arithmetic. That arithmetic is not the estimate.
- With `STORAGE=supabase`, sign-in is email and password. Customers see only jobs shared with them. The passwordless dev sign-in is absent in that mode. Media paths are unlisted. See `docs/AUTH.md` and `docs/STORAGE.md`.
- Depth files in `atmosphere-depth-v1` (see `samples/atmosphere-depth-v1.json`) import as inferred geometry. Other depth formats are stored only. See `docs/INTEGRATION.md` for the seams a later Atmosphere port would replace.
- This is not a certified survey, moisture map, or structural opinion.

## Layout

- `src/domain` — geometry, quantities, catalog, estimate engine, scope, review. No React.
- `src/analysis` — evidence rules and the staged pipeline.
- `src/spatial` — 3D schematic built from the sketch.
- `src/app` — demo UI and HTTP routes.
- `src/samples` — scripted walkthroughs.
