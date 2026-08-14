# Toast — Self-Hosted Out-of-Band Interaction Gatherer

A powerful, self-hosted **Out-of-Band Application Security Testing (OAST)** platform—built to run 100% free on **Cloudflare Free Tier** (Workers, D1, Email Routing).

Like Burp Collaborator & ProjectDiscovery Interactsh, **Toast** captures DNS lookups, HTTP/HTTPS callbacks, and incoming Email/SMTP interactions triggered during security assessments (e.g., Log4j, Blind SSRF, Blind RCE, XXE, SQLi, and Command Injections).

Designed with a **Swiss-style ultra-minimal UI** (no glowing cyber/AI slop), fast Server-Sent Events (SSE) live streaming, and terminal CLI support.

---

## Features

- **Multi-Protocol Interaction Capture**:
  - **HTTP & HTTPS**: Captures Method, URL, Query params, Headers, Request Body, Client IP, Cloudflare TLS Ray ID, and Geolocation.
  - **DNS Lookups**: Captures DoH (DNS-over-HTTPS) & raw UDP 53 DNS queries (A, AAAA, TXT, MX, CNAME, PTR).
  - **SMTP & Email**: Captures incoming emails sent to `*@yourdomain.com` via Cloudflare Email Routing.
- **Ultra-Minimal Web Dashboard**:
  - Clean monochrome aesthetic with crisp typography.
  - Real-time live log feed via SSE.
  - Instant Payload Generator chips (Log4j, SSRF, XXE, Blind XSS, Email).
  - Raw request & JSON payload inspector.
  - Custom HTTP status codes, headers, bodies, or DNS TXT records per payload ID.
- **Terminal CLI Client**:
  - Colorized CLI client (`node cli/oast-cli.js`) streaming security alerts directly in your console.
- **100% Free Cloudflare Infrastructure**:
  - Cloudflare Workers (100,000 requests/day free).
  - Cloudflare D1 SQL Database (5 Million read rows / 100,000 write rows free per day).
  - Cloudflare Email Routing (Free incoming email processing).

---

## 🚀 Cloudflare Free Tier Deployment Guide

### Prerequisites
1. A free [Cloudflare Account](https://dash.cloudflare.com).
2. Node.js (v18+) and npm installed locally.
3. (Optional) A custom domain added to your Cloudflare account.

---

### Step 1: Clone & Install Dependencies

```bash
git clone https://github.com/Llyr4472/toast.git
cd toast
npm install
```

---

### Step 2: Create Cloudflare D1 Database

Run the following command to create a serverless D1 database:

```bash
npx wrangler d1 create toast-db
```

Output example:
```text
[[d1_databases]]
binding = "DB"
database_name = "toast-db"
database_id = "xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy the `database_id` and paste it into `wrangler.jsonc`:

```json
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "toast-db",
    "database_id": "YOUR_COPIED_DATABASE_ID"
  }
]
```

---

### Step 3: Initialize Database Schema

Execute `schema.sql` on your Cloudflare D1 database:

```bash
# For Remote Production DB:
npm run db:init:prod

# For Local Testing:
npm run db:init
```

---

### Step 4: Deploy to Cloudflare Workers

Deploy the project in one click:

```bash
npm run deploy
```

Your worker will be live at `https://toast.<your-subdomain>.workers.dev`.

---

### Step 5: (Optional) Setup Custom Domain & Email Routing

To test custom subdomains (`*.oast.yourdomain.com`) and Email callbacks:

1. **Custom Domain / Wildcard DNS**:
   - Go to Cloudflare Dashboard -> **Workers & Pages** -> Select `toast`.
   - Go to **Settings** -> **Domains & Routes** -> Add Custom Domain (e.g. `oast.yourdomain.com` or `*.oast.yourdomain.com`).
2. **Email Routing**:
   - Go to Cloudflare Dashboard -> **Email Routing** -> **Email Workers**.
   - Set a Routing Rule: Catch-all `*@oast.yourdomain.com` -> Send to Worker `toast`.

---

## 💻 Local Development & Testing

Run the local dev server:

```bash
npm run dev
```

Open `http://localhost:8787` in your browser to view the Minimal Web Dashboard.

---

## 🖥️ Terminal CLI Usage

Stream interaction alerts directly in your terminal:

```bash
# Connect to local worker:
node cli/oast-cli.js http://localhost:8787

# Connect to deployed production worker:
node cli/oast-cli.js https://toast.<your-subdomain>.workers.dev
```

---

## 🛰️ Optional: Standalone Raw UDP 53 DNS Daemon

Cloudflare Workers process HTTP, DoH, and Email. If you want native UDP port 53 DNS query resolution on a free micro-VPS (e.g., Oracle Cloud Free Tier, Fly.io, or local network):

```bash
# Start DNS Daemon listening on Port 53:
WORKER_URL="https://toast.<your-subdomain>.workers.dev" DNS_SECRET="toast-default-secret" node dns-server/dns-daemon.js
```

---

## License

MIT License. Built for security researchers, penetration testers, and bug bounty hunters.
