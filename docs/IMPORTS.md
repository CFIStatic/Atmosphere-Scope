# Floor plan import

A walkthrough can start from a plan a restorer already drew. Imported lengths are labeled `imported from` that file. They are treated as measured by that tool. They are not a tape confirmation in this app. Where a video measurement of the same room name exists, the two are compared and neither number is overwritten.

## Formats this app reads

| File | What is used |
| --- | --- |
| CSV | Header `room` or `name`, plus `width_ft` and `depth_ft` (or `width` and `depth` / `length`). Optional `height_ft`. |
| magicplan statistics CSV | Documented room fields include `name`, `dimensions`, `height`, and `area_without_walls` ([magicplan statistics](https://help.magicplan.app/export-statistics), [field names](https://help.magicplan.app/coconstruct-parameters)). A `dimensions` value such as `12' x 14'` becomes the two wall spans. Area alone does not become a rectangle. |
| DXF | Closed `LWPOLYLINE` entities. `$INSUNITS` selects inches, feet, millimeters, centimeters, or meters. If that header is missing, the form must say which unit. `LINE` entities are not joined into a guessed room. magicplan's sketch export includes DXF ([export formats](https://help.magicplan.app/export-formats)); their help notes that DXF dimensions may be omitted, so the geometry is what is read. Hover's documented CAD export includes `cad_export.dxf` ([measurements and deliverables](https://developers.hover.to/reference/measurements-and-deliverables)). |
| SVG | `polygon` and `rect`. The file has no feet scale. The form asks how many feet one drawing unit is. magicplan also exports SVG. |
| Hover measurements JSON | The published interior example has `rooms[].name`, `floor_area`, `floor_edges`, `min_ceiling_height`, `max_ceiling_height`, and `walls[].area` ([Get JSON Measurements](https://developers.hover.to/reference/get-json-measurements)). Those values are kept. Individual wall lengths are not in that example, so no outline is drawn from them. Door width is not inferred from area and perimeter. |

## Not imported

DocuSketch's help center documents sketch downloads as JPEG, PNG, Xactimate `.ESX`, and Cotality/Symbility `.FML`, plus PDF reports ([download options](https://help.docusketch.com/docs/download-options)). `.ESX` and `.FML` are those vendors' formats. This app does not parse them. A partnership, or an export DocuSketch documents as CSV, DXF, or SVG with a published schema, is what would connect that sketch. A German marketing page mentions CSV, PDF, and DXF downloads; it does not publish the column or entity schema, so those files are read only if they already match the generic CSV or DXF rules above.

magicplan's project XML, IFC, OBJ, and USDZ are listed on their export and webhook docs. This importer does not parse those. Their API can deliver the DXF, SVG, and CSV files above to a webhook; calling that API needs a magicplan key this app does not store.

Hover PDF, XLSX, SKP, DWG, and XML exports are documented. This importer reads the JSON measurements file and a DXF, not those other artifacts. Calling Hover's API needs their credentials.

Xactimate ESX is not implemented.
