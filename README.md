# Toast

Out-of-Band (OAST) interaction server built for Cloudflare Workers and D1.

Toast captures incoming DNS lookups, HTTP/HTTPS callbacks, and email interactions triggered during security testing.

## Features

- **HTTP & HTTPS**: Logs HTTP method, URL, headers, query parameters, request body, client IP, and TLS ray ID.
- **DNS**: Supports DNS-over-HTTPS (DoH) queries and includes a standalone Node.js UDP port 53 daemon.
- **Email**: Captures incoming emails via Cloudflare Email Routing.
- **Dashboard & API**: Minimal real-time web dashboard (Server-Sent Events) and REST API for CLI tool integration.
- **Mock Responses**: Configurable HTTP status codes, headers, bodies, and DNS TXT records per payload ID.

## Cloudflare Setup

### 1. Installation

```bash
git clone https://github.com/Llyr4472/toast.git
cd toast
npm install
```

### 2. D1 Database Configuration

Create a D1 database:

```bash
npx wrangler d1 create toast-db
```

Update `wrangler.jsonc` with the database ID returned by Wrangler:

```json
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "toast-db",
    "database_id": "<your-database-id>"
  }
]
```

### 3. Database Initialization

Execute the database schema:

```bash
# Production
npm run db:init:prod

# Local development
npm run db:init
```

### 4. Deployment

Deploy the worker:

```bash
npm run deploy
```

## Local Development

Start the local development server:

```bash
npm run dev
```

Dashboard will be available at `http://localhost:8787`.

## CLI Usage

Run the terminal client to monitor interactions in real time:

```bash
# Standard 8-character payload ID
node cli/oast-cli.js https://toast.<your-subdomain>.workers.dev

# Short 4-character payload ID
node cli/oast-cli.js https://toast.<your-subdomain>.workers.dev --short
```

## UDP DNS Daemon (Optional)

To run a standalone DNS daemon on UDP port 53:

```bash
WORKER_URL="https://toast.<your-subdomain>.workers.dev" DNS_SECRET="toast-default-secret" node dns-server/dns-daemon.js
```

## License

MIT
