# Estimate

Atmosphere Scope writes the estimate. The draft scope and estimate screen on Claims maps the sketch and the identified contents onto a versioned catalog, then prices each component from a recorded source.

## Catalog

`GET /api/catalog` returns the current version and the ids of older versions. `PUT /api/catalog` with `{ "items": [ ... ] }` publishes the next version. It does not edit a version that already exists.

The starter version is `catalog-starter-1`, “Residential interior starter.” It covers water mitigation, fire mitigation, interior rebuild, and one contents replacement line. Each item has:

| Field | Meaning |
| --- | --- |
| `code` | Stable line code, such as `REB-FLOOR`. |
| `category` | `mitigation`, `rebuild`, or `contents`. |
| `description` | What the line is. |
| `unit` | `sqft`, `lf`, or `each`. |
| `basis` | Where the quantity comes from: `floor_area`, `wall_area`, `baseboard`, or `each`. |
| `triggers` | `sketch` for rebuild from the plan, `water` or `fire` when that loss is selected, `contents` for one line per identified object. |
| `components` | Labor (`trade`, `hoursPerUnit`), material (`query`), or equipment (`equipment`, `perUnit`). Hours are a production assumption, not a dollar rate. |

A loss of `none` emits sketch-triggered rebuild lines and one contents line per identified object. Water and fire lines appear only when that loss is selected. A quantity that is not on the sketch stays null.

Admins edit the lines on the draft screen and publish. The previous version remains in `data/estimate-store.json`.

## Rates

`GET /api/rates` returns the current rate book. `PUT /api/rates` saves the next version (`rates-2`, then `rates-3`, and so on).

| Field | Meaning |
| --- | --- |
| `region` | Label for the rate book. The starter says `Unspecified`. |
| `labor` | Hourly amount by trade. The starter trades are general, carpenter, painter, and floor. |
| `equipment` | Amount for an air mover, dehumidifier, or extractor. |
| `overheadPercent`, `profitPercent`, `taxPercent` | Fractions. The screen edits them as percents. Overhead is a percent of direct cost. Profit is a percent of direct cost plus overhead. |
| `taxBase` | `none` taxes the line after overhead and profit. `materials` taxes the material amount only. |
| `source`, `asOf` | Required on every saved rate. A blank amount is stored as null with source `No rate entered`. It is not stored as zero. |

Materials are not in the rate book. They come from the walkthrough’s replacement offers: the price, the retailer or note as the source, and the verified / unverified / unpriced status. Offers in this build do not carry a retrieved date, so the material date stays empty. A line total is omitted when the quantity is missing or any component has no price. The sum of complete lines is labeled as that sum. It is not presented as a complete estimate while other lines are unpriced.

## Report

Schema id: `atmosphere.estimate.v1`.

| Field | Meaning |
| --- | --- |
| `id`, `createdAt`, `status` | `draft` until Finalize estimate. A final id ends with `:final:` and the timestamp. |
| `catalogVersionId`, `rateBookId`, `region` | The versions this report used. |
| `settings` | Overhead, profit, tax, and tax base copied from the rate book. |
| `lines` | Room, code, description, quantity, unit, quantity note, priced components (`kind`, `label`, `amount`, `source`, `asOf`), direct, overhead, profit, tax, `lineTotal`, and `unpriced` notes. |
| `pricedTotal` | Sum of lines that have a `lineTotal`, or null when none are complete. |
| `unpricedCount`, `note` | How many lines are incomplete, and why. |

`POST /api/estimate/report` accepts `{ "report": { ... }, "format": "pdf" | "csv" | "json" }`. JSON is the default. The body must already be `atmosphere.estimate.v1`. The route does not reprice it.

Finalize estimate stores that report on the walkthrough in this browser. Later edits to the catalog or the rate book do not change the stored copy. Send report downloads the finalized copy when one exists, and the current draft otherwise.

The web view is the draft screen. PDF, CSV, and JSON are the same report.
