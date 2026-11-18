# Asset Register Extractor — DTP PSV & PV

A browser-based engineering data extraction workflow that reads client Excel/CSV, PDF and image documents, maps source information to the 38 AI-populated fields in the DTP PSV & PV workbook, supports manual review, and exports into the original Excel template.

## Architecture

- **Frontend:** GitHub Pages (static HTML, CSS and JavaScript)
- **Backend:** Cloudflare Worker (`worker/src/index.js`)
- **AI:** Google Gemini API called only from the Worker; the API key is stored as a Cloudflare Worker secret
- **Spreadsheet parsing:** SheetJS in the browser
- **Excel export:** ExcelJS in the browser, loading the original template workbook
- **Session data:** browser `sessionStorage`; custom field aliases and Worker URL use `localStorage`

## Target workbook

The current workbook is `assets/templates/asset-register-template.xlsx` (latest user-provided DTP PSV & PV template).

- Worksheet: `Sheet1`
- Physical columns: A:AM (39 columns)
- Header: rows 1–4, including the original merged headings
- First asset record: row 5
- Column A (`No.`): generated sequentially
- Columns AC:AD: protected equipment type and item number
- Columns AE:AF: protected equipment design and operating temperature
- Columns AG:AH: protected equipment design and operating pressure
- Columns AI:AK: orifice area
- Columns AL:AM: capacity

The exporter loads the actual `.xlsx` template and writes data rows into it. It does not recreate the workbook, so the original merged header cells, column widths, header text, and formatting remain in place.

## Workflow

1. Open the site and save the Cloudflare Worker URL under **Settings / Worker URL**.
2. Upload client `.xlsx`, `.xls`, `.csv`, `.pdf`, `.png`, `.jpg`, `.jpeg`, or `.webp` files.
3. Spreadsheet files are read in the browser. Source rows are sent to Gemini in small batches; PDFs/images are sent to Gemini as document content.
4. Gemini returns records using the canonical DTP PSV field keys. Unknown values are `null`; the model is instructed not to guess or silently convert units.
5. Use **Field Mapping** to add optional client-specific alias hints.
6. Use **Data Review** to edit all extracted values, inspect confidence and source file/location, and correct missing or duplicate tags.
7. Click **Export DTP Excel** to download a copy of the original template populated from row 5.

## Multi-document consolidation

Open **Multi-Document Upload** to submit multiple supporting documents for one or more PSV assets.

- Each PDF/image or spreadsheet is extracted independently using the configured Worker.
- Extracted records are consolidated only when their normalized Tag PSV matches.
- Records without a Tag PSV are kept separate; they are never automatically guessed into a group.
- Empty fields can be populated from another matching source.
- Conflicting non-empty values are not overwritten. The first value is retained and the alternative value is displayed in the Data Review **Merge Conflicts** column.
- Source file names and source locations are retained for traceability.
- Review all conflicts and source documents before exporting the consolidated register.

## Cloudflare Worker configuration

Set these under Worker → Settings → Variables and Secrets:

- `GEMINI_API_KEY` — **Secret**, never expose this in frontend code
- `GEMINI_MODEL` — optional variable; defaults to `gemini-2.5-flash-lite`

The Worker exposes:

- `GET /api/health`
- `POST /api/extract/document` (multipart form: `file`, optional `mapping` JSON)
- `POST /api/extract/table` (JSON: `file_name`, `sheet_name`, `headers`, `rows`, optional `mapping`)

Supported document MIME types: PDF, PNG, JPEG, WEBP. Document uploads are limited to 10 MB. Spreadsheet requests are batched to 15 rows and capped at 20 rows / 100 columns / 90 KB per Worker request.

## GitHub Pages deployment

`.github/workflows/static.yml` publishes only the frontend pages and `assets/` into `_site`. The `worker/` source is not published to GitHub Pages. Cloudflare deploys the Worker separately from the `worker/` directory.

## Important engineering controls

- Treat AI extraction as a draft, not an approved engineering record.
- Review every extracted value against its source document before issuing the register.
- Empty fields mean the value was not identified in the source; do not interpret them as zero or not applicable.
- No unit conversion or calculation is performed automatically unless the value is explicitly present in the source.
- Do not upload confidential client documents unless your organization authorizes processing by the configured external AI service.
- Current data storage is browser-session based; records are not synchronized to a database and may be lost when the session is cleared.
