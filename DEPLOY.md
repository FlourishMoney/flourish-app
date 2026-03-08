# Flourish — Vercel Deployment Guide
## From zero to live at app.flourishmoney.app

---

## What You're Deploying

```
flourish-deploy/
├── api/
│   └── coach.js          ← Secure AI proxy (API key lives here, server-side)
├── src/
│   ├── main.jsx           ← React entry point
│   └── App.jsx            ← Full Flourish app (3,700+ lines)
├── public/                ← Static assets (add icon.png here)
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
└── .env.example
```

**Security:** All 4 Anthropic API calls now go through `/api/coach` — the key never reaches the browser.

---

## Step 1 — Create GitHub Account

1. Go to [github.com](https://github.com)
2. Sign up with `hello@flourishmoney.app`
3. Username suggestion: `flourishmoney`
4. Create a new **private** repository called `flourish-app`

---

## Step 2 — Push Code to GitHub

Open Terminal and run:

```bash
# Navigate to the project folder
cd flourish-deploy

# Initialize git
git init
git add .
git commit -m "Initial Flourish app — secure AI proxy + 5 financial engines"

# Connect to your GitHub repo (replace YOUR_USERNAME)
git remote add origin https://github.com/flourishmoney/flourish-app.git
git branch -M main
git push -u origin main
```

---

## Step 3 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Sign in with GitHub (`hello@flourishmoney.app`)
3. Click **"Add New Project"**
4. Import `flourish-app` from GitHub
5. Vercel auto-detects Vite — leave all settings as-is
6. Click **"Deploy"**

Your app is now live at a `.vercel.app` URL (e.g. `flourish-app-abc123.vercel.app`)

---

## Step 4 — Add Your API Key (Critical)

1. In Vercel dashboard → your project → **Settings** → **Environment Variables**
2. Add:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** your key from [console.anthropic.com](https://console.anthropic.com/settings/keys)
   - **Environments:** Production ✓, Preview ✓, Development ✓
3. Click **Save**
4. Go to **Deployments** → click the three dots on your latest deployment → **Redeploy**

The AI coach will now work in production. Your key is only readable server-side.

---

## Step 5 — Add Your Custom Domain

1. In Vercel → Settings → **Domains**
2. Add: `app.flourishmoney.app`
3. Vercel gives you a CNAME record to add:
   - In Namecheap → Advanced DNS → Add CNAME:
     - Host: `app`
     - Value: `cname.vercel-dns.com`
4. Wait 5–15 minutes for DNS propagation
5. Vercel auto-provisions SSL certificate ✓

Your app is now live at: **https://app.flourishmoney.app**

---

## Step 6 — (Optional) Local Development

To run locally with the API proxy working:

```bash
cd flourish-deploy
npm install

# Install Vercel CLI
npm install -g vercel

# Create .env.local
cp .env.example .env.local
# Edit .env.local and add your real ANTHROPIC_API_KEY

# Run with Vercel dev (runs both Vite + API functions)
vercel dev
```

Visit: `http://localhost:3000`

> ⚠️ Regular `npm run dev` works but API calls will fail — use `vercel dev` to test AI features locally.

---

## How the Proxy Works

```
User taps "Ask AI Coach"
        ↓
React: fetch("/api/coach", { type:"chat", payload:{...} })
        ↓
Vercel Serverless Function: api/coach.js
        ↓
Server adds your secret key: x-api-key: process.env.ANTHROPIC_API_KEY
        ↓
Anthropic API responds
        ↓
Vercel forwards response to React
        ↓
User sees AI response
```

**The API key only exists on Vercel's servers. It is never sent to the browser.**

---

## Environment Variables Reference

| Variable | Where to Get It | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/settings/keys) | ✅ Yes |
| `PLAID_CLIENT_ID` | [dashboard.plaid.com](https://dashboard.plaid.com) | Later |
| `PLAID_SECRET` | [dashboard.plaid.com](https://dashboard.plaid.com) | Later |

---

## DNS Records Summary (Namecheap → flourishmoney.app)

| Type | Host | Value | Purpose |
|---|---|---|---|
| TXT | @ | `google-site-verification=...` | Google Workspace verify |
| MX | @ | `smtp.google.com` (Priority 1) | Gmail |
| TXT | `google._domainkey` | `v=DKIM1; k=rsa; p=...` | Email authentication |
| CNAME | `app` | `cname.vercel-dns.com` | **App deployment** (add this) |
| CNAME | `www` | `cname.vercel-dns.com` | Coming soon page (optional) |

---

## After Deployment Checklist

- [ ] App loads at `app.flourishmoney.app`
- [ ] AI Coach responds (means proxy + API key working)
- [ ] What-If Simulator returns results
- [ ] Weekly Check-In AI tip loads
- [ ] HTTPS certificate shows green lock
- [ ] Privacy Policy at `flourishmoney.app/privacy`
- [ ] Terms at `flourishmoney.app/terms`

---

## Coming Soon Page (Separate)

The `flourish-coming-soon.html` file deploys separately:
1. Create a second Vercel project
2. Upload just `flourish-coming-soon.html` as `index.html`
3. Assign domain: `flourishmoney.app` (root domain)

This way:
- `flourishmoney.app` → Coming soon / waitlist
- `app.flourishmoney.app` → The actual app

---

*Built with React 18 + Vite + Vercel Serverless Functions*
*Flourish © 2026 GrowSmart / Amanda Holt*
