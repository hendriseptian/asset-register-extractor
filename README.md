# Asset Register Extractor

Starter project for extracting equipment data from client Excel, PDF and image documents into a standardized asset register.

## Architecture

- Frontend: GitHub Pages (static HTML/CSS/JavaScript)
- Backend: Cloudflare Workers
- AI: Google Gemini API (server-side secret)
- Excel import: SheetJS
- Excel export: ExcelJS
- PDF/image understanding: Gemini multimodal input

## Important security notes

- Never put Gemini/Groq API keys in frontend JavaScript or commit them to GitHub.
- Use dummy or approved non-confidential documents while testing free AI services.
- The Worker CORS setting is permissive for initial testing. Restrict it to your exact GitHub Pages origin before production.
- The 10 MB upload limit is a starter safeguard, not a guarantee that all large PDFs will fit model limits.
- All AI-extracted values must be reviewed against source documents.

## 1. Publish frontend with GitHub Pages

1. Push the repository contents to GitHub.
2. Open **Settings → Pages**.
3. Select **Deploy from a branch**.
4. Choose `main` and `/ (root)`, then Save.
5. Wait for the published Pages URL.

## 2. Deploy Cloudflare Worker

Install Node.js, then from the `worker` directory run:

```bash
npm install -g wrangler
npx wrangler login
npx wrangler deploy
```

Set the Gemini API key as a Cloudflare secret:

```bash
npx wrangler secret put GEMINI_API_KEY
```

Paste the key when prompted. Do not put it in `wrangler.toml`.

The deployed Worker URL will look like:

`https://asset-register-extractor-api.<your-subdomain>.workers.dev`

Open the website's `index.html`, enter that Worker URL and continue.

## 3. Test the backend

Open:

`https://YOUR-WORKER-URL/api/health`

Expected response:

```json
{"ok":true,"service":"asset-register-extractor-worker","aiProvider":"gemini-configured"}
```

## 4. Current starter capabilities

- Excel/CSV upload and basic header alias matching in browser
- PDF and image upload to Worker for Gemini extraction
- Editable review table
- Excel export using the included starter template
- Browser-local mapping settings and session data

## 5. Current limitations / next development tasks

- The current Excel reader handles simple tabular sheets; complex multi-row headers and merged cells need enhancement.
- `.xls` compatibility depends on the SheetJS browser build.
- The initial export writes standardized columns into the template worksheet; adapt the exporter to the client's actual DTP template before project use.
- Groq fallback is intentionally a placeholder until a model with suitable vision support and confirmed free-tier access is selected.
- Authentication, user roles, durable project history, advanced OCR and robust multi-page PDF chunking are not implemented yet.
- CORS is currently open for initial testing; restrict it before production.
- Gemini model availability and free-tier quotas can change. Check Google AI Studio pricing and limits.

## Disclaimer

This is a development starter, not a validated engineering records system. Verify all extracted information manually before issuing an asset register.
