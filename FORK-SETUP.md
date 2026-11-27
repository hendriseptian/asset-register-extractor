# MECHASSET — Fork & Setup Guide

This guide installs a separate MECHASSET workspace for your own GitHub and Cloudflare accounts. Your D1 database, Gemini API key, and Worker are yours; they are not shared with the original repository owner.

## What you need

1. A GitHub account.
2. A Cloudflare account.
3. A Gemini API key from Google AI Studio.
4. A Windows PC with Git and Node.js LTS installed.
   - Git: https://git-scm.com/downloads
   - Node.js LTS: https://nodejs.org/
5. PowerShell (included with Windows).

> Keep your Gemini API key private. Do not put it in a frontend file, GitHub commit, README, or screenshot.

## Part 1 — Fork the repository

1. Sign in to GitHub.
2. Open https://github.com/hendriseptian/asset-register-extractor
3. Click **Fork**.
4. Choose your own GitHub account as the owner.
5. Keep the repository name `asset-register-extractor` (recommended).
6. Click **Create fork**.
7. Open your fork and confirm that its address is similar to:
   `https://github.com/YOUR-USERNAME/asset-register-extractor`.

A Fork is your own copy of the repository. Changes you make to your fork do not directly change the original repository.

## Part 2 — Download your fork to Windows

1. Open your fork on GitHub.
2. Click the green **Code** button.
3. Select **HTTPS** and copy the repository URL.
4. Open PowerShell.
5. Run the following command, replacing the URL with your own fork URL:

```powershell
git clone https://github.com/YOUR-USERNAME/asset-register-extractor.git
cd asset-register-extractor
```

Do not clone the original `hendriseptian` repository if you intend to deploy your own independent workspace.

## Part 3 — Create your Gemini API key

1. Open https://aistudio.google.com/apikey
2. Sign in to your Google account.
3. Create an API key.
4. Copy the key and keep it private. You will paste it into the setup script when prompted.
5. Do not save it in any file inside the repository.

Gemini usage limits, billing, and availability are controlled by Google and your own account.

## Part 4 — Run the automatic Cloudflare setup

The repository includes `setup-mechasset.ps1`. It automates the first-time backend setup.

1. In PowerShell, make sure the current directory is the cloned repository folder.
2. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-mechasset.ps1
```

3. Enter a D1 database name when prompted, or press Enter to use `mechasset-db`.
4. Enter a Worker name when prompted, or press Enter to use `asset-register-extractor`.
5. A browser window opens for Cloudflare login. Sign in to the Cloudflare account where you want the application to run and authorize Wrangler.
6. The script creates a new D1 database in that Cloudflare account.
7. The script writes that database's ID into your local `worker/wrangler.toml`.
8. The script applies every SQL migration in `worker/migrations` to the new remote database. This includes the schema needed by the supported PSV, BVV, and PV workflows.
9. When Wrangler asks for `GEMINI_API_KEY`, paste the key you created in Part 3.
10. The script deploys your Worker and prints its `workers.dev` URL.

The setup script does not intentionally change the original GitHub repository. The D1 ID written to `worker/wrangler.toml` is local to your cloned copy unless you explicitly commit and push it.

### If the script says a database with that name already exists

The script is designed for a fresh setup and creates a new D1 database. If you already created one manually, do not repeatedly rerun the full script. Either choose a different database name for a fresh install, or follow the manual recovery steps below and use the ID of the existing database.

### Manual recovery if automatic D1 ID detection fails

If the script reports that it could not read the new database ID:

1. Open Cloudflare Dashboard → **Workers & Pages** → **D1 SQL Database**.
2. Open the database you just created and copy its **Database ID**.
3. Open `worker/wrangler.toml` in your local repository.
4. Set `database_name` to the exact database name and `database_id` to the copied ID.
5. Open PowerShell in the repository root and run:

```powershell
cd worker
npx wrangler d1 migrations apply YOUR_DATABASE_NAME --remote
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
cd ..
```

Replace `YOUR_DATABASE_NAME` with the exact name of your D1 database.

## Part 5 — Publish your frontend with GitHub Pages

1. Open your fork on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, select **GitHub Actions** as the source.
4. Open the **Actions** tab.
5. If prompted, enable GitHub Actions for the fork.
6. Run the workflow named **Deploy MECHASSET**, or make a small documentation change and push it to the `main` branch to trigger the workflow.
7. Wait until the workflow finishes successfully.
8. Open the published GitHub Pages URL shown in **Settings → Pages**.

The workflow publishes the frontend. It does not deploy the Cloudflare Worker; that backend was deployed separately in Part 4.

## Part 6 — Connect the website to your Worker

1. Open your GitHub Pages website.
2. On the connection screen, paste the `workers.dev` URL printed by the setup script.
3. Click **Continue to workspace**.
4. Confirm that the dashboard loads.
5. Open the API test page if available and test the Worker health endpoint.
6. Confirm the database health endpoint reports that the database is connected and the schema is complete.

Use the URL from your own Worker deployment, not the original repository owner's Worker URL.

## Part 7 — Keep your fork updated

When the original repository receives improvements:

1. Open your fork on GitHub.
2. Select **Sync fork**.
3. Review incoming changes before accepting them.
4. Pull the updated fork to your local computer:

```powershell
git pull
```

5. If changes affect files under `worker/`, redeploy the Worker from the repository's `worker` directory:

```powershell
cd worker
npx wrangler deploy
cd ..
```

Do not overwrite your own `worker/wrangler.toml` with another user's D1 ID. Keep your own database ID and Worker secrets.

## What is created for each user?

| Component | Belongs to |
|---|---|
| GitHub repository | The user who created the Fork |
| GitHub Pages frontend | The user's GitHub account |
| Cloudflare Worker | The user's Cloudflare account |
| D1 database | The user's Cloudflare account |
| Gemini API key | The user's Google account |
| Worker URL | The user's Cloudflare deployment |

## Troubleshooting

### D1 database not found (Wrangler error 10181)

The database ID in `worker/wrangler.toml` does not belong to the Cloudflare account currently selected by Wrangler, or the database does not exist in that account. Check the database ID and sign in to the correct Cloudflare account using:

```powershell
cd worker
npx wrangler logout
npx wrangler login
npx wrangler whoami
```

Then verify `database_id` and `database_name` in `wrangler.toml`.

### Database connected but schema incomplete

Apply all migrations again:

```powershell
cd worker
npx wrangler d1 migrations apply YOUR_DATABASE_NAME --remote
```

### Gemini API key missing or invalid

Set the secret again:

```powershell
cd worker
npx wrangler secret put GEMINI_API_KEY
```

Do not use `wrangler.toml` or frontend JavaScript to store this secret.

### Website cannot connect to the Worker

- Confirm the Worker deployment succeeded.
- Confirm the URL entered in MECHASSET is your own `workers.dev` URL and uses HTTPS.
- Visit `YOUR_WORKER_URL/api/health` in a browser.
- Check that your GitHub Pages site has finished deploying.

## Important notes

- This setup creates a separate backend and database for each user. It does not copy your data into the original author's account.
- The script is intended for Windows PowerShell and a new installation.
- Cloudflare and Gemini account quotas, service terms, and possible charges depend on each user's account and plan.
- AI-extracted engineering information is a draft. Verify all extracted values against the source documents before using them in an engineering register.
- Do not upload confidential client documents unless your organization authorizes processing through the services you configure.
