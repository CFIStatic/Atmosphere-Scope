# Integration contracts

Atmosphere Scope keeps analysis, geometry, and estimating behind replaceable interfaces. The demo UI calls those modules. It does not own the rules.

## Media

Uploaded files stay in private storage (`data/media` in this prototype) and are read through the job route. A production port should swap `src/storage/job-store.ts` for the platform’s private bucket and access checks. Original bytes are not rewritten by analysis.

## Transcription and frames

`TranscriptionProvider` and `FrameAnalysisProvider` in `src/analysis/providers.ts` are the seams. The prototype ships unavailable providers plus sample transcripts and frame notes. A model must return evidence. `acceptModelOutput` drops payloads that try to set prices, approvals, or instructions.

Narration is never an instruction channel. `screenText` flags phrases such as “ignore previous instructions” and the pipeline stores them as reported speech.

## Layout and the 3D map

Room polygons and heights live on the sketch document. `buildSpaceModel` only extrudes that sketch. Unmeasured heights are drawn at 8 ft and labeled as a viewing aid. They are not written back as measurements.

`atmosphere-depth-v1` JSON can seed polygons. Imported edges stay inferred until someone locks them. Other depth formats are stored and not reconstructed.

Photogrammetry, SLAM, and proprietary estimating databases are not connected.

## Scope and price

`buildScope` decides what work is supported, conditional, optional, or excluded. Wording from a future model cannot add a line the rules rejected.

`PriceBook` is the pricing seam. The bundled book is named “Illustrative—not a customer quote.” Totals use `priceAll`: direct cost, one overhead pass, then either markup or margin, then tax. Conditional and optional amounts stay outside the supported total.

## Review

Estimate versions move `ai_draft` → `estimator_reviewed` → `estimator_approved`. Customer authorization is a different actor and must name the version id. Approved versions are not edited in place. Later analysis or quantity changes open a draft revision.

## Identity

Jobs, rooms, media, findings, sketch entities, scope lines, and estimate versions use stable string ids. Human corrections set `humanCorrected` or `humanEdited` and are kept when a pipeline run repeats.
