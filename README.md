# MECHASSET — Mechanical Asset Management Platform

A browser-based engineering data extraction workflow that reads client Excel/CSV, PDF and image documents, maps source information to the 39 AI-populated fields in the DTP PSV & PV workbook, supports manual review, and exports into the original Excel template.

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
- Physical columns: A:AN (40 columns)
- Header: rows 1–4, including the original merged headings
- First asset record: row 5
- Column A (`No.`): generated sequentially
- Columns AC:AE: protected equipment type, item number, and fluid
- Columns AF:AG: protected equipment design and operating temperature
- Columns AH:AI: protected equipment design and operating pressure
- Columns AJ:AL: orifice area
- Columns AM:AN: capacity

The exporter loads the actual `.xlsx` template and writes data rows into it. It does not recreate the workbook, so the original merged header cells, column widths, header text, and formatting remain in place.

## Workflow

1. Open the site and save the Cloudflare Worker URL under **Settings / Worker URL**.
2. Upload client `.xlsx`, `.xls`, `.csv`, `.pdf`, `.png`, `.jpg`, `.jpeg`, or `.webp` files.
3. Spreadsheet files are read in the browser. Source rows are sent to Gemini in small batches; PDFs/images are sent to Gemini as document content.
4. Gemini returns records using the canonical DTP PSV field keys. Unknown values are `null`; the model is instructed not to guess or silently convert units.
5. Use **Field Mapping** to add optional client-specific alias hints.
6. Use **Data Review** to edit all extracted values, inspect confidence and source file/location, and correct missing or duplicate tags.
7. Click **Export DTP Excel** to download a copy of the original template populated from row 5.

## Gemini response reliability

The Worker uses a defensive JSON response pipeline for both PSV and BVV/PVV extraction:

- Requests JSON-only output with temperature 0 and an expanded output-token budget.
- Removes Markdown fences and safely extracts the first complete JSON object if the model adds surrounding text.
- Repairs only safe trailing commas outside quoted strings; it does not guess or rewrite extracted field values.
- Validates that the response contains a top-level `records` array.
- If JSON is malformed, the Worker retries once with the same source document and a stricter JSON-only recovery instruction.
- Transient Gemini HTTP errors are retried, with the configured fallback model used where applicable.
- If the retry still fails, the file is reported as failed while successful files in the same upload batch remain saved.

This reduces avoidable failures caused by malformed model output, but cannot guarantee success for every file. Gemini quota limits, service outages, safety blocks, unsupported/poor-quality scans, oversized documents, and output truncation can still require a manual retry or splitting the source PDF. Always review extracted values against the original document.

**Deployment note:** changes under `worker/` must be deployed to Cloudflare Workers separately from GitHub Pages. After updating this repository, deploy from the `worker` directory using Wrangler (or the connected Cloudflare Worker build pipeline).

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


## Fork and install your own MECHASSET workspace

Want to use MECHASSET with your own GitHub and Cloudflare accounts? Start with **[FORK-SETUP.md](FORK-SETUP.md)**. It is written for beginners and explains how to Fork the repository, create a separate Gemini API key, create your own Cloudflare D1 database, apply all database migrations, deploy your Worker, and publish the GitHub Pages frontend.

**Recommended: GitHub Actions Automatic Cloudflare Setup.** After Fork, add three repository secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `GEMINI_API_KEY`), then run **Actions → MECHASSET - Automatic Cloudflare Setup**. The workflow creates or reuses the user's own D1 database, obtains its ID dynamically, applies all migrations (PSV/BVV/PV), stores the Gemini key as a Worker secret, and deploys the Worker. See [FORK-SETUP.md](FORK-SETUP.md) for exact steps and required token permissions. The original repository's D1 configuration is not changed. Windows users can still use `setup-mechasset.ps1` as a local alternative.
