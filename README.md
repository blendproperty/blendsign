# BlendSign

E-signature platform for South African property documents. Ordinary
electronic signatures under the ECT Act 25 of 2002, POPIA-aligned data
handling, hosted in South Africa.

**Not currently implemented:** Advanced Electronic Signatures (AES) / SAAA
accreditation. Documents requiring AES (e.g. certain suretyships) need an
accredited provider such as LAWtrust — confirm with a property lawyer which
of Blend's document types require this before relying on BlendSign alone.

## Stack

Next.js (App Router) · PostgreSQL + Prisma · Redis + BullMQ (background
jobs) · MinIO/S3-compatible object storage · Docker Compose · Traefik
(reverse proxy + automatic HTTPS via Let's Encrypt)

## Local development

```bash
cp .env.example .env      # fill in real values
docker compose up -d postgres redis minio
npm install
npx prisma migrate dev
npm run dev
```

App runs at http://localhost:3000. Worker runs separately:

```bash
node worker/index.js
```

## Production deploy

```bash
cp .env.example .env      # set APP_DOMAIN, ACME_EMAIL and real secrets
# Generate SESSION_SECRET with: openssl rand -hex 32
docker compose up -d --build
docker compose exec -T app npx prisma db push
```

Traefik handles TLS automatically for `APP_DOMAIN` via Let's Encrypt's
HTTP challenge. Point your DNS A record at the host before starting, or
the ACME challenge will fail.

## Administration and companies

BlendSign has protected administrator and company-user sign-in. Set
`ADMIN_EMAIL`, a unique `ADMIN_PASSWORD`, and a random `SESSION_SECRET` in
`.env` before the first production start.

The administrator can create separate company workspaces under
**Settings > Companies**. Each company has isolated documents, contacts,
users, roles, API keys, webhook endpoints, organisation details, colours,
logo, legal disclosure and custom-domain setting. Use the company switcher
in the top bar before creating or managing documents.

## API and webhooks

Create a company-scoped key under **Settings > Integrations and API**. The
key is shown once and stored only as a SHA-256 hash.

```bash
curl -H 'Authorization: Bearer bs_live_YOUR_KEY' \
  https://sign.example.co.za/api/v1/health

curl -H 'Authorization: Bearer bs_live_YOUR_KEY' \
  https://sign.example.co.za/api/v1/envelopes

curl -H 'Authorization: Bearer bs_live_YOUR_KEY' \
  https://sign.example.co.za/api/v1/templates

curl -H 'Authorization: Bearer bs_live_YOUR_KEY' \
  https://sign.example.co.za/api/v1/templates/stor24-unit-lease
```

Template discovery returns only templates owned by the API key's company.
The detail endpoint exposes the configured roles, field labels, merge data
keys, defaults, requirements and page occurrences without exposing private
PDF storage keys.

Webhook requests include `x-blendsign-event` and an
`x-blendsign-signature: sha256=...` HMAC header. Webhook secrets are
encrypted at rest using `SESSION_SECRET`, shown once, and retried through
BullMQ when delivery fails.

## Signing status

End-to-end signing flow works: upload a PDF at `/new`, add signers, send —
each signer gets a tokenized link (`/sign/[token]`), draws their signature
or fills fields, and submits with explicit consent. Once every signer has
signed, a background job flattens the field values onto the PDF, appends a
certificate-of-completion page with the full audit trail, computes a
sha256 hash for tamper-evidence, and stores the sealed PDF.

Still simplified / not yet built:

- **Field placement is hardcoded** (`/new` auto-places one signature box
  per signer on page 1) rather than a drag-and-drop editor over the
  rendered PDF. This is the next priece of work.
- **WhatsApp delivery** uses the Meta API when the token, phone number ID
  and API version are configured. Without all three it logs a manual
  `wa.me` fallback link.
- **Email** uses SMTP via nodemailer if `SMTP_HOST` is set, otherwise logs
  to console — wire up real SMTP creds (or a transactional email provider)
  before relying on it.
- **Retention automation** is not yet scheduled. Administrators can move
  documents to trash, restore them, or permanently remove database and
  MinIO objects manually.
- **Custom company domains** are stored per company, but their DNS,
  Traefik routing and TLS certificate must be configured on the host before
  they receive live signing traffic.
- Expiry (`expire-envelopes` job) exists but nothing schedules it yet —
  needs a cron trigger, e.g. via BullMQ repeatable jobs or an external
  scheduler hitting a cron endpoint.

## Architecture

See `prisma/schema.prisma` for the data model (Org, OrgMembership, User,
Contact, ApiKey, WebhookEndpoint, Envelope, Signer, Field and AuditEvent)
and `docker-compose.yml` for the service
topology (Traefik, app, worker, Postgres, Redis, MinIO).
