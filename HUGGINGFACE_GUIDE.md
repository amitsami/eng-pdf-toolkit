# Deploy ENG PDF Toolkit on Hugging Face

1. Create an account at https://huggingface.co and verify your email address.
2. Open your profile menu and select **New Space**:
   - Space name: `eng-pdf`
   - License: Select a license only if you have chosen one for your project. This repository does not currently have a project-wide license; do not assume it is MIT-licensed.
   - SDK: **Docker** → **Blank** template
   - Hardware: **CPU basic** (free, subject to current platform availability and limits)
   - Visibility: **Public**
   - Select **Create Space**.
3. Under **Settings → Variables and secrets**, add these secrets:
   - `OWNER_PASSWORD`: A strong password for your private dashboard.
   - `OWNER_PATH`: A private dashboard route, for example `owner-your-random-route`.
   - `OWNER_SECRET`: A long random value (30 or more characters) used for session signing. Keep it stable across restarts if you want existing login sessions to remain valid.
4. Open **Files → Add file → Upload files**. Upload the contents of the project folder, including `Dockerfile`, `README.md`, `app.py`, `backend/`, `static/`, and `fonts/`. Preserve the directory structure.
   - Replace the initial README if prompted, then select **Commit changes to main**.
   - Do not upload credentials, runtime databases, or the `data/` directory.
5. Wait for the **App** tab to change from **Building** to **Running**. Build times vary.
   - App URL: `https://USERNAME-eng-pdf.hf.space`
   - Dashboard URL: `https://USERNAME-eng-pdf.hf.space/YOUR_OWNER_PATH`

## Important Notes

- Share the direct `.hf.space` URL. Embedded app pages at `huggingface.co/spaces/...` may behave differently for cookies and sign-in.
- Free hardware may sleep after inactivity. A new visitor can trigger a restart, so the first request may be slower. Check Hugging Face's current policies for exact limits.
- Without persistent storage, runtime files and visitor analytics may be lost after a restart or update. Export analytics as CSV when needed. The owner password and session secret can be restored from the secrets you configured.
- Committing updated files triggers a new build automatically.
- Hosting limits apply even though the toolkit itself is free to use. Translation sends content to external services.
