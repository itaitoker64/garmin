# Coach

A personal training dashboard that reads your real Garmin Connect data
(recovery, training load, activities, fitness markers) and turns it into a
daily coaching briefing — deployed as a single Next.js app on Vercel.

It's built for one user (you). Sign in with your own email/password or
Google account, connect your Garmin account once, and the dashboard pulls
your metrics on every load.

There's also a standalone Garmin Connect **MCP server for Claude Desktop**
in [`mcp-server/`](mcp-server/) if you'd rather chat with Claude about your
data directly instead of using the web dashboard — see that folder's own
README.

## How it's put together

- **`app/`** — Next.js 15 App Router frontend: login, Garmin-connect, and
  the dashboard.
- **`lib/`** — auth config, encryption helpers, the rule-based coaching
  engine, and shared types.
- **`api/garmin-data/`** — Python Vercel Functions that do the actual Garmin
  Connect calls (via the [`garminconnect`](https://github.com/cyberjunky/python-garminconnect)
  library). Called only by the Next.js server, never by the browser
  directly — gated behind `INTERNAL_FN_SECRET`.
- **`mcp-server/`** — the original Claude Desktop MCP connector (unchanged,
  Windows-only, optional).

### Why two languages in one deploy

Garmin's auth requires TLS fingerprinting (`curl_cffi`) that only has a
mature Python implementation. Vercel supports Python alongside a Next.js
app in the same project as long as the Python files live in a top-level
`api/` directory (outside `app/`) — that's what `api/garmin-data/*.py` is.
(Files *starting* with an underscore in `api/` are excluded from routing,
which is why the shared helper is `_garmin_lib.py` but the endpoints
themselves can't live in an underscore-prefixed folder.)

### Session model

There's no database. After you connect Garmin once, the server encrypts
Garmin's session token (AES-256-GCM, key from `SESSION_ENC_KEY`) and stores
it in httpOnly cookies (sharded across a few cookies if it doesn't fit in
one). Every dashboard load decrypts it, calls the Python function to
refresh your data, re-encrypts whatever token comes back, and re-sets the
cookie — so you never have to re-enter your Garmin password unless the
underlying refresh token itself expires (Garmin's, typically months).

Your app-level login (NextAuth) is separate from your Garmin connection —
signing out clears your app session; "Disconnect Garmin" clears the Garmin
cookie.

## Deploying

1. Push this repo to GitHub (already done if you're reading this from the
   repo) and [import it in Vercel](https://vercel.com/new).
2. Set the environment variables below in the Vercel project settings.
3. Deploy. Vercel builds the Next.js app and the Python functions in the
   same deployment automatically.
4. Visit the deployed URL, sign in, connect Garmin, done.

### Required environment variables

| Variable | Purpose |
|---|---|
| `NEXTAUTH_SECRET` | Random secret NextAuth uses to sign session JWTs. Generate with `openssl rand -base64 32`. |
| `ADMIN_EMAIL` | The email you'll log in with (credentials login). |
| `ADMIN_PASSWORD_HASH` | A bcrypt hash of your login password. Generate locally: `npx bcryptjs-cli hash "yourpassword"` or via `node -e "console.log(require('bcryptjs').hashSync('yourpassword', 10))"`. |
| `SESSION_ENC_KEY` | Random key used to encrypt the Garmin session cookie. Generate with `openssl rand -base64 32`. |
| `INTERNAL_FN_SECRET` | Random shared secret between the Next.js server and the Python functions, so the Python endpoints reject anyone who isn't your own server. Generate with `openssl rand -hex 32`. |

### Optional environment variables

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Enables "Continue with Google" on the login page. Create an OAuth client in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) with authorized redirect URI `https://<your-domain>/api/auth/callback/google`. |
| `OWNER_EMAIL` | If set, only this email address may ever hold a session — protects against someone else signing in with a Google account if credentials leak. Set it to your own email. |

> **Local dev note:** if you put `ADMIN_PASSWORD_HASH` in a local `.env`
> file, escape every `$` as `\$` — Next.js expands unescaped `$VAR` in env
> files, which corrupts bcrypt hashes (they're full of `$`). This does
> **not** apply to variables set directly in the Vercel dashboard — those
> are stored literally.

### MFA / 2FA note

Accounts with 2FA enabled are supported: after submitting your email and
password, the form asks for the security code Garmin sends you (email or
SMS). The pending login state is held in an encrypted, httpOnly cookie for
up to 10 minutes while you enter the code; after that you'd need to log in
again. Once connected, the stored session token refreshes itself and no
further codes are needed.

### Deployment Protection note

Internal server-to-function calls are routed through the project's public
production domain (`VERCEL_PROJECT_PRODUCTION_URL`), so Vercel's Standard
Deployment Protection doesn't wall them off in production. For protected
*preview* deployments, enable "Protection Bypass for Automation" in the
Vercel dashboard — the resulting `VERCEL_AUTOMATION_BYPASS_SECRET` is picked
up automatically.

## Local development

```bash
npm install
pip install -r requirements.txt   # for the Python functions, if testing them locally
npm run dev
```

The Python functions won't run under `next dev` (Vercel's dev server —
`vercel dev` — is needed to emulate them locally). For UI work, `next dev`
alone is enough; `/api/garmin/*` calls will fail until you run through
`vercel dev` or deploy to a preview.

## The coaching logic

The "AI coach" briefing is deterministic, not an LLM call — see
[`lib/coach.ts`](lib/coach.ts). It applies the same thresholds Garmin and
sports-science literature use (acute:chronic workload ratio 0.8–1.3 is the
sweet spot, >1.5 is real overtraining risk, training readiness bands, HRV
status, sleep score, body battery, stress) to produce a headline, a
recommendation, and the list of contributing signals. No API key required,
and it's fully auditable — you can see exactly why it said what it said.
