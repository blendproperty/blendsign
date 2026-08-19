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
cp .env.example .env      # set APP_DOMAIN, ACME_EMAIL, real secrets
docker compose up -d --build
```

Traefik handles TLS automatically for `APP_DOMAIN` via Let's Encrypt's
HTTP challenge. Point your DNS A record at the host before starting, or
the ACME challenge will fail.

## Project status

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
- **No auth** — `/new` posts a hardcoded `orgId`/`createdById`. Needs real
  auth (NextAuth or similar) before this is usable beyond a single person.
- **WhatsApp delivery** logs a `wa.me` link rather than sending via the
  WhatsApp Business API — fine for manual send in the interim, not
  automated.
- **Email** uses SMTP via nodemailer if `SMTP_HOST` is set, otherwise logs
  to console — wire up real SMTP creds (or a transactional email provider)
  before relying on it.
- **POPIA consent/retention flows** (privacy policy acceptance, data
  deletion tooling, retention period enforcement) are not yet built —
  see the project scope doc.
- Expiry (`expire-envelopes` job) exists but nothing schedules it yet —
  needs a cron trigger, e.g. via BullMQ repeatable jobs or an external
  scheduler hitting a cron endpoint.

## Architecture

See `prisma/schema.prisma` for the data model (Org, User, Envelope,
Signer, Field, AuditEvent) and `docker-compose.yml` for the service
topology (Traefik, app, worker, Postgres, Redis, MinIO).
