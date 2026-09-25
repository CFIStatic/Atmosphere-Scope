# Integration contracts

Atmosphere Scope keeps analysis, geometry, and estimating behind replaceable interfaces. The demo UI calls those modules. It does not own the rules.

## Media

Uploaded files stay in private storage (`data/media` in this prototype) and are read through the job route. A production port should swap `src/storage/job-store.ts` for the platform’s private bucket and access checks. Original bytes are not rewritten by analysis.

## Transcription and frames

`TranscriptionProvider` and `FrameAnalysisProvider` in `src/analysis/providers.ts` are the seams for the evidence pipeline. Sample jobs still pass transcripts and frame notes in. A model must return evidence. `acceptModelOutput` drops payloads that try to set prices, approvals, or instructions.

A walkthrough video sent to `POST /api/measure` uses OpenAI when `OPENAI_API_KEY` is set: speech-to-text, vision on at most four keyframes, and the Responses API web search tool for replacement offers. The measurement itself is local OpenCV and does not use that key. If the key is missing, or a call fails, narration, objects, and prices stay empty. They are not invented. An AI failure does not fail the room measurement.

Narration is never an instruction channel. `screenText` flags phrases such as “ignore previous instructions” and the pipeline stores them as reported speech.

Replacement prices are checked by fetching the product page on the server. Only the http(s) URL from the pricing result is fetched, after DNS resolution, and private, loopback, link-local, and metadata addresses are refused, including redirects. A retailer block, an empty page, or a price the page does not contain stays unverified. A missing price or a non-public URL is dropped. Nothing is guessed. SerpAPI is used only when `PRICING_PROVIDER=serpapi`. Replicate and Modal are optional notes in `src/analysis/adapters/gpu.ts`; this build does not call them. Storage is local disk unless `STORAGE=supabase`. See `docs/STORAGE.md`.

The measure page keeps recording when the phone is offline. Chunks stay in IndexedDB and a service worker caches the capture shell. The browser uploads those chunks when a connection returns. Measurement still runs on the server, from `POST /api/measure/uploads/:id/finish`.

## Layout and the 3D map

Room polygons and heights live on the sketch document. `buildSpaceModel` only extrudes that sketch. Unmeasured heights are drawn at 8 ft and labeled as a viewing aid. They are not written back as measurements.

`atmosphere-depth-v1` JSON can seed polygons. Imported edges stay inferred until someone locks them. Other depth formats are stored and not reconstructed.

The metric solver is `measure/`: a printed ChArUco sheet, CPU calibration, and plane fitting. It is not a photogrammetric mesh of the whole video, and it does not call a hosted GPU. COLMAP and learned multi-view models were not run. Proprietary estimating databases are not connected.

## Scope and price

`buildScope` decides what work is supported, conditional, optional, or excluded. Wording from a future model cannot add a line the rules rejected.

`PriceBook` is the pricing seam. The bundled book is named “Illustrative—not a customer quote.” Totals use `priceAll`: direct cost, one overhead pass, then either markup or margin, then tax. Conditional and optional amounts stay outside the supported total.

## Review

Estimate versions move `ai_draft` → `estimator_reviewed` → `estimator_approved`. Customer authorization is a different actor and must name the version id. Approved versions are not edited in place. Later analysis or quantity changes open a draft revision.

## Identity

Jobs, rooms, media, findings, sketch entities, scope lines, and estimate versions use stable string ids. Human corrections set `humanCorrected` or `humanEdited` and are kept when a pipeline run repeats.
