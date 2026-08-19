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

This is an early scaffold: data model, Docker/Traefik deployment, and a
skeleton envelope-creation API + signer view are in place. Not yet built:
PDF field-placement editor, signature capture UI, email/WhatsApp delivery,
PDF flattening/sealing, and the POPIA consent/retention flows described in
the project scope doc.

## Architecture

See `prisma/schema.prisma` for the data model (Org, User, Envelope,
Signer, Field, AuditEvent) and `docker-compose.yml` for the service
topology (Traefik, app, worker, Postgres, Redis, MinIO).
