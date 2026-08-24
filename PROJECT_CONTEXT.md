# BlendSign project context

## Stor24 completed-document retrieval — 24 August 2026

Task 6 has started on branch `codex/task6-integration-downloads`. The existing signed-PDF and completion-certificate routes now accept either the normal signed-in company context or a valid company-scoped BlendSign API key. Envelope lookup remains constrained to the API key's `orgId`, excludes deleted envelopes, and still returns `409` until sealing/certificate data is ready. This allows Stor24 to proxy completed artifacts server-to-server without exposing the API key or object-storage keys to the browser. TypeScript and the full production build pass locally. This is not deployed or production-proven yet; after merge/deployment, verify a valid Stor24 download, a wrong-company `404`, an invalid-key `401`, and an incomplete-envelope `409`.

## Stor24 reliability and reminder API — 24 August 2026

Task 7 adds `POST /api/v1/envelopes/[id]/resend` for approved API-key integrations. The envelope lookup is constrained to the API key organisation and excludes deleted/completed/declined/expired/voided envelopes. Only the currently eligible incomplete routing tier receives a reminder; stored automatic company signers and recipients without email are excluded. An integration-supplied idempotency key is required, is recorded in the envelope audit trail, and is used for deterministic queue job IDs so retries do not duplicate the same reminder work. Three routing tests and the full production build pass locally. Stor24 calls this endpoint only through its server-side API key and adds its own permission, facility and audit checks. Deployment and a controlled reminder test remain outstanding.

Last updated: 20 August 2026

This is the primary handover document for engineers and language models working on BlendSign. Read this file, `prisma/schema.prisma`, and the relevant route handlers before changing the system. The older status section in `README.md` is partly outdated. The code is authoritative where documentation and implementation differ.

## 1. Product summary

BlendSign is a self-hosted electronic document preparation and signing platform for Blend Property Group and related or client brands such as Stor24.

Its purpose is to:

- Upload and prepare PDF documents.
- Add signers and signing order.
- Place signature, initials, date, text and checkbox fields visually.
- Create reusable company-owned templates.
- Create public SignForms from templates.
- Support authenticated self-signing.
- Send company-branded signing requests.
- Capture electronic-signature consent and audit evidence.
- Seal the completed PDF after all parties have signed.
- Append a completion certificate and audit trail.
- Email the completed document to all signers.
- Retain original and signed documents in private object storage.
- Provide company-scoped API keys and signed webhooks for external integrations.

BlendSign is not an accredited Advanced Electronic Signature provider. Do not describe it as providing Advanced Electronic Signatures or SAAA accreditation. Legal suitability for a particular South African document type must be confirmed independently.

## 2. Repository and deployment

Canonical organisation repository:

```text
https://github.com/blendproperty/blendsign
```

Active development fork:

```text
https://github.com/doveydragon/blendsign
```

Production deployment source:

```text
blendproperty/blendsign main
```

Deployed and verified 21 August 2026: production is on commit `ec21c9389c6ae005474a1810e9335742ef46feb9` from organisation `main`. GitHub Actions run `32453728097`, attempt 2, completed successfully after checking out that exact commit, taking a PostgreSQL backup, building both `app` and `worker`, running `prisma migrate deploy`, recreating both services and receiving HTTP 200 from the public `/login` health probe. The first attempt did not reach the VPS because SSH port 22 timed out; the successful retry completed in 1 minute 46 seconds.

The production database predated Prisma migration tracking. Before the successful deployment, the reviewed SQL for `20260821110000_envelope_external_idempotency` was applied directly and then recorded with `prisma migrate resolve --applied`; `prisma migrate status` subsequently reported the schema up to date. The pre-change backup is `/root/backups/blendsign-predeploy-20260821-060821.sql.gz` (461 KB). The successful deployment also took a fresh timestamped pre-deployment backup through the guarded workflow.

Current production hostname:

```text
https://blendsign.srv938083.hstgr.cloud
```

The production checkout is normally located at:

```text
/root/blendsign
```

Do not infer production state from a Git push alone. Confirm the successful deployment run, exact VPS commit and live service checks before reporting a change as deployed.

## 3. Technology stack

| Area | Technology |
| --- | --- |
| Web application | Next.js 14 App Router, React 18, TypeScript |
| Database | PostgreSQL 16 with Prisma |
| Background jobs | Redis and BullMQ |
| File storage | MinIO through the S3-compatible AWS SDK |
| PDF rendering in browser | react-pdf and PDF.js |
| PDF sealing | pdf-lib in the worker |
| Email | Nodemailer over configured SMTP |
| Reverse proxy and TLS | Traefik 3.1 and Let's Encrypt |
| Runtime | Node.js 22 Alpine containers |
| Deployment | Docker Compose on a Hostinger VPS |

## 4. Service topology

`docker-compose.yml` defines six services:

1. `traefik`, the only service publishing host ports 80 and 443.
2. `app`, the Next.js application on internal port 3000.
3. `worker`, the BullMQ worker built from the same image.
4. `postgres`, the private database service.
5. `redis`, the private queue service.
6. `minio`, the private S3-compatible document store.

PostgreSQL, Redis and MinIO are attached to the internal Docker network and should not be published directly to the internet.

The app and worker share:

- The PostgreSQL database.
- The Redis queue.
- The MinIO bucket.
- SMTP configuration.
- The `SESSION_SECRET`, which also protects encrypted webhook secrets.

## 5. Environment configuration

The expected variable names are documented in `.env.example`. Never place real secrets in source control, issues, pull requests, screenshots or this file.

Important groups:

### Application

```text
APP_DOMAIN
ACME_EMAIL
NODE_ENV
ADMIN_EMAIL
ADMIN_PASSWORD
SESSION_SECRET
```

### PostgreSQL

```text
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_DB
DATABASE_URL
```

### Redis

```text
REDIS_URL
```

### Object storage

```text
MINIO_ROOT_USER
MINIO_ROOT_PASSWORD
S3_ENDPOINT
S3_BUCKET
S3_REGION
```

### Delivery

```text
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
SMTP_FROM
WHATSAPP_BUSINESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_API_VERSION
```

Production secrets must be long, unique and rotated if exposed. `SESSION_SECRET` must contain at least 32 random characters. The example values containing `changeme` or `replace-` are placeholders and are not safe for production.

## 6. Multi-company model

The `Org` model represents a company workspace. Blend Property Group, Stor24 and any future company must have separate `Org` records.

Company-owned data includes:

- Users and memberships.
- Contacts.
- API keys.
- Webhook endpoints.
- Templates.
- SignForms.
- Envelopes and signed documents.
- Logos, colours, legal wording and sender identity.

The active company is selected with the `blendsign_entity` cookie. `getRequestContext()` resolves the authenticated user, selected organisation and membership role.

Every authenticated database query involving company data must filter by `orgId: context.org.id`. Never trust an organisation ID supplied by the browser.

API requests derive their organisation from the bearer API key. Never accept a company name or organisation ID in an external payload as authority to cross company boundaries.

Administrative actions use `canAdminister(context)`, which permits super administrators, owners and company administrators.

## 7. Company branding and sender identity

Each `Org` can store:

- Name and address details.
- Reply email address.
- Uploaded logo key or external logo URL.
- Primary and accent colours.
- Legal disclosure.
- Custom signing domain.
- Visible email sender name.
- Optional email sender address.

The active company's branding is used on:

- Signing-request emails.
- Completion emails.
- Public SignForms.
- Recipient signing pages.
- The authenticated navigation.

The SMTP server must authorise any actual sender address. A company-specific visible sender name can use the shared SMTP mailbox, but a different address may be rejected or rewritten unless configured as a valid mailbox or alias.

## 8. Authentication and access

The current authenticated interface uses an HMAC-signed cookie named `blendsign_session`.

Important current behaviour:

- Session lifetime is 12 hours.
- The bootstrap administrator comes from environment configuration.
- Ordinary users and company memberships are stored in PostgreSQL.
- Company roles are `owner`, `admin` and `member`.
- API keys begin with `bs_live_`.
- API keys are shown once and stored as SHA-256 hashes.
- Revoked or expired API keys are rejected.

Current authentication is not the desired final security posture. MFA, login throttling, server-side session revocation and inactivity expiry remain security work.

## 9. Core database model

The authoritative schema is `prisma/schema.prisma`.

### Organisation and access

- `Org`
- `User`
- `OrgMembership`
- `Contact`
- `ApiKey`
- `WebhookEndpoint`

### Reusable workflows

- `Template`
- `TemplateRole`
- `TemplateField`
- `SignForm`

### Signing requests

- `Envelope`
- `Signer`
- `Field`
- `AuditEvent`

### Envelope states

```text
DRAFT
SENT
PARTIALLY_SIGNED
COMPLETED
DECLINED
EXPIRED
VOIDED
```

### Signer states

```text
PENDING
VIEWED
SIGNED
DECLINED
```

### Field types

```text
SIGNATURE
INITIALS
DATE
TEXT
CHECKBOX
```

## 10. Document storage

PDFs and logos are stored in the configured S3-compatible bucket. In the self-hosted deployment, the provider is MinIO.

Object keys are organisation-prefixed. For example:

```text
<org-id>/originals/<uuid>-document.pdf
```

The template and envelope APIs verify that uploaded object keys begin with the active organisation's prefix. Preserve this rule.

The database stores object keys, not PDF bytes. Document download routes read the object server-side after checking company access or signer token access.

The signed PDF is immutable after sealing. Editing a completed document is limited to safe metadata such as its title. Altering sealed pages would invalidate the recorded SHA-256 hash.

## 11. Main document workflows

### 11.1 One-off send

Route:

```text
/new
```

The authenticated user uploads a PDF, adds recipients, places fields and sends an envelope. The envelope belongs to the active company.

### 11.2 Reusable templates

Routes:

```text
/templates
/templates/new
/templates/[id]/edit
/templates/[id]/use
```

Templates contain:

- A source PDF.
- Signer roles.
- Signing order.
- Field type and PDF placement.
- Resizable field dimensions.
- Field binding metadata described in section 12.

Existing envelopes are copied from template configuration and remain unchanged when a template is edited later.

Administrators can delete templates. Deletion also removes the source PDF, roles, fields and linked SignForms. Existing envelopes created from that template remain intact.

### 11.3 SignForms

Routes:

```text
/signforms
/signforms/new
/signforms/[id]/edit
/form/[slug]
```

A SignForm is a public URL linked to a reusable template. It gathers one recipient for every template role, creates a new envelope and sends or opens the first signing step.

SignForms can be paused without being deleted. An inactive template cannot start a new SignForm request.

### 11.4 Self-signing

Entry:

```text
/new?mode=self
```

The authenticated user uploads a PDF, places and resizes their own fields, supplies values and creates an audit-tracked completed request without first emailing themselves a signing link.

### 11.5 Recipient signing

Routes:

```text
/sign/[token]
/api/sign/[token]
```

The token identifies one signer. The signer can:

- Review the PDF.
- Type, draw or upload a signature.
- Provide initials once and reuse them across their assigned positions.
- Complete text, date and checkbox fields.
- Give explicit consent to electronic signing.

Signature and initials reuse is scoped to one signer. A value is never copied to another person's fields.

### 11.6 Completion

After the final signer submits:

1. The app queues `seal-document`.
2. The worker loads the original PDF and field values.
3. `worker/lib/pdf.js` flattens values onto the PDF.
4. A completion certificate page and audit events are appended.
5. The worker stores the signed PDF.
6. A SHA-256 hash is saved on the envelope.
7. The envelope becomes `COMPLETED`.
8. An `envelope.completed` webhook is delivered.
9. The completed PDF is emailed once to every unique signer email.

Completion delivery is retry-safe. Successful recipient deliveries are written as audit events and skipped during a retry.

### 11.7 Completed-document workspace

Route:

```text
/documents/[id]
```

The workspace provides:

- Signed PDF viewing.
- Page thumbnails and navigation.
- Zoom controls.
- Fullscreen and printing.
- PDF download.
- Completion-certificate download.
- Recipient and audit timeline.
- Title editing without altering the signed PDF.
- Emailing the completed PDF to up to three recipients.

## 12. Template API bindings

The current branch adds the foundation required for Stor24 document automation.

Each template can now store:

- `apiIdentifier`, a public company-scoped template identifier such as `stor24-unit-lease`.
- `version`, an integer revision number starting at 1.
- `active`, which controls whether new requests may use the template.

`apiIdentifier` is nullable in the database so legacy templates continue working after deployment. Creating a new template requires it. Editing a legacy template requires assigning it once. Company administrators may correct an existing identifier, with an explicit warning that the old API URL will stop working. Values resembling private `bs_live_` company API secrets are rejected.

The same identifier may exist in different companies, but cannot be duplicated within one company.

Each `TemplateField` can now store:

- `label`, such as `Tenant full name`.
- `dataKey`, such as `tenant.fullName`.
- `defaultValue`.
- `required`.
- `editableBySigner`.

Text, date and checkbox fields may use data keys. Signature and initials fields are supplied by their assigned signer and cannot use a data key or default value.

Repeated data keys are valid. If `tenant.fullName` appears three times, one integration value will eventually populate all three positions.

When an envelope is created from a template, this metadata is copied to its `Field` records. Default values are carried into the signing request. Locked values cannot be changed by the signing client, and the API checks this server-side.

Suggested Stor24 mapping:

| PDF value | Data key |
| --- | --- |
| Tenant full name | `tenant.fullName` |
| ID or passport number | `tenant.idNumber` |
| Email | `tenant.email` |
| Mobile number | `tenant.phone` |
| Unit number | `unit.number` |
| Unit size | `unit.size` |
| Start date | `lease.startDate` |
| Monthly rental | `lease.monthlyRental` |

See `docs/TEMPLATE_BINDINGS.md` for the shorter field-binding reference.

## 13. Background queue

The BullMQ queue name is:

```text
blendsign
```

Current jobs:

- `send-signing-link`
- `seal-document`
- `deliver-webhook`
- `email-document`
- `expire-envelopes`

The expiry handler exists, but no repeatable job or external schedule currently invokes it.

## 14. Email behaviour

Signing and completion emails are sent from `worker/lib/mail.js`.

Email branding comes from the envelope's organisation. Completion emails attach the signed PDF and include its SHA-256 value.

If SMTP is absent:

- Signing-link delivery logs a development fallback.
- Completion delivery fails, because claiming successful delivery without SMTP would be false.

Do not weaken this distinction.

## 15. Webhooks

Webhook endpoints belong to an organisation and subscribe to selected events.

Requests contain:

```text
x-blendsign-event
x-blendsign-signature: sha256=<hex-hmac>
```

Webhook secrets are encrypted using AES-256-GCM with a key derived from `SESSION_SECRET`. Secrets are shown once when created.

The receiver must calculate HMAC-SHA256 over the exact raw request body and compare it using a timing-safe method.

Current webhook event examples include:

```text
envelope.sent
envelope.viewed
envelope.signed
envelope.completed
```

## 16. Current authenticated API

Company API keys are managed under:

```text
/settings/integrations
```

Implemented versioned endpoints:

```text
GET /api/v1/health
GET /api/v1/envelopes
GET /api/v1/templates
GET /api/v1/templates/[templateKey]
```

`GET /api/v1/envelopes` returns up to 100 non-deleted envelopes for the API key's organisation.

`GET /api/v1/templates` lists API-configured templates belonging to the API key's organisation. It returns status, revision and field counts without exposing PDF object-storage keys.

`GET /api/v1/templates/[templateKey]` returns the selected template's roles, signing order, field labels, data keys, types, defaults, required status, signer-editability, page references and repeated-key occurrence counts. It does not return another organisation's template even when the caller knows its key.

Example discovery requests:

```bash
curl -sS \
  -H 'Authorization: Bearer YOUR_STOR24_API_KEY' \
  https://blendsign.srv938083.hstgr.cloud/api/v1/templates

curl -sS \
  -H 'Authorization: Bearer YOUR_STOR24_API_KEY' \
  https://blendsign.srv938083.hstgr.cloud/api/v1/templates/stor24-unit-lease
```

Never place a real API key in source control, screenshots or chat transcripts.

The branch prepared on 21 August 2026 implements template-based envelope creation. It is code-complete and build-tested locally, but it is not deployed, migrated, configured or live-tested; do not claim Stor24 automation is live until those production steps and both payment paths are verified. Branch `codex/stor24-envelope-api` is pushed at `a9f77b5`. A guarded, manual `Deploy to VPS` workflow and repository secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` and `VPS_KNOWN_HOSTS` are configured in `blendproperty/blendsign`; the SSH key was verified against `/root/blendsign`. The workflow has not been run.

## 17. Stor24 integration plan

Stor24 should use BlendSign as its central document and signing engine.

Relevant applications:

```text
Stor24 website: https://stor4.srv938083.hstgr.cloud/
Stor24 operations portal: https://github.com/blendproperty/stor24-portal
BlendSign: https://github.com/doveydragon/blendsign
```

The intended flow is:

1. A customer completes their details in Stor24.
2. Stor24 calls BlendSign server-to-server using a Stor24-owned API key.
3. BlendSign derives the Stor24 organisation from that API key.
4. BlendSign resolves the active `stor24-unit-lease` template within Stor24 only.
5. Submitted values populate matching template `dataKey` fields.
6. BlendSign creates the recipients, fields, envelope and signing links.
7. Signing proceeds through the existing worker and recipient flow.
8. BlendSign sends a signed `envelope.completed` webhook to Stor24.
9. Stor24 retrieves the completed PDF and certificate securely.
10. Stor24 stores the BlendSign reference and displays the files under the tenant or lease Documents section.

### 17.1 Template-envelope API

Implemented on the 21 August 2026 integration branch:

```text
POST /api/v1/envelopes/from-template
```

The route must:

- Authenticate with `authenticateApiKey()`.
- Derive `orgId` only from the API key.
- Resolve an active template by `orgId` and `apiIdentifier`.
- Reject unknown data keys unless the contract explicitly allows extras.
- Validate one recipient for every template role.
- Populate all repeated field keys.
- Preserve locked and default values.
- Create an audit event containing the template key and revision.
- Return the envelope ID, status and signing information needed by Stor24.
- Use idempotency so retries do not create duplicate leases.

### 17.2 Expected request shape

The final contract may be refined, but the intended shape is:

```json
{
  "templateKey": "stor24-unit-lease",
  "externalReference": "LEASE-2026-00124",
  "title": "Stor24 Unit Lease A104",
  "data": {
    "tenant.fullName": "Example Tenant",
    "tenant.idNumber": "REDACTED",
    "tenant.email": "tenant@example.test",
    "tenant.phone": "+27100000000",
    "unit.number": "A104",
    "unit.size": "6 m2",
    "lease.startDate": "2026-09-01",
    "lease.monthlyRental": "1250.00"
  },
  "recipients": [
    {
      "role": "Signer 1",
      "name": "Example Tenant",
      "email": "tenant@example.test"
    },
    {
      "role": "Stor24 Rep",
      "name": "Example Stor24 Representative",
      "email": "representative@example.test"
    }
  ]
}
```

Use synthetic values in tests and documentation. Never commit genuine customer identity numbers or leases.

### 17.3 Additional model work likely required

The next stage should consider adding envelope fields for:

- External system name.
- External reference.
- Idempotency key.
- Source template ID and revision as first-class fields, in addition to audit metadata.

A uniqueness rule should prevent the same company and idempotency key from producing duplicate envelopes.

### 17.4 Stor24-side work

The 21 August 2026 Stor24 portal integration branch now includes:

- A server-only BlendSign API client.
- Secure environment variables for the base URL and API key.
- Field mapping from Stor24 tenant, unit and lease records.
- Storage of the BlendSign envelope ID.
- A verified webhook receiver.
- Payment-method routing between `stor24-unit-lease-debit-order` and `stor24-unit-lease`.

Still required before the integration is operational:

- Deploy both repositories and apply both database migrations.
- Configure the Stor24-owned API key, base URL, matching webhook URL and shared webhook secret.
- Live-test disposable debit-order and non-debit journeys through both signers and completion.
- Add a tenant or lease Documents download UI.
- Add secure completed-PDF and certificate retrieval.
- Add retry and reconciliation handling.

Do not place the BlendSign API key in browser JavaScript.

## 18. Route catalogue

### Authenticated pages

```text
/dashboard
/documents
/documents/[id]
/new
/reports
/templates
/templates/new
/templates/[id]/edit
/templates/[id]/use
/signforms
/signforms/new
/signforms/[id]/edit
/settings/branding
/settings/contacts
/settings/entities
/settings/integrations
/settings/profile
/settings/trash
/settings/users
```

### Public pages

```text
/login
/form/[slug]
/sign/[token]
```

### Important internal APIs

```text
/api/auth/*
/api/documents/upload
/api/envelopes/*
/api/forms/[slug]/start
/api/self-sign
/api/sign/[token]
/api/signforms/*
/api/templates/*
/api/settings/*
/api/reports/export
```

## 19. Development and validation

Typical local setup:

```bash
cp .env.example .env
docker compose up -d postgres redis minio
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Run the worker separately when not using Docker Compose:

```bash
node worker/index.js
```

Minimum validation before publishing a change:

```bash
npx prisma validate
npx prisma generate
npx tsc --noEmit
npm run build
git diff --check
```

The project currently has no complete automated integration-test suite. A successful build is necessary but not sufficient for changes affecting signing, PDF sealing, storage, queues, email, authentication or tenant isolation. Test those flows against disposable data before production use.

## 20. Production deployment

Production deployments use the manual `Deploy to VPS` workflow in `.github/workflows/deploy-vps.yml`. It deploys the requested organisation-repository ref (normally `main`) as a detached checkout and performs the backup, build, migration, restart and health probe as one guarded job.

For application-only changes:

```bash
docker compose build app
docker compose up -d --no-deps --force-recreate app
```

For worker or shared-code changes:

```bash
docker compose build app worker
docker compose up -d --no-deps --force-recreate app worker
```

For Prisma schema changes, use committed migrations after building and before recreating the services:

```bash
docker compose run --rm --no-deps app npx prisma migrate deploy
```

Then verify the workflow logs and independently confirm:

```bash
docker compose ps
docker compose logs --tail=60 app worker
curl -Ik https://blendsign.srv938083.hstgr.cloud/login
```

Never use destructive database reset commands in production. Take and test backups before significant schema or storage changes.

## 21. Security posture and known gaps

BlendSign has useful security foundations, but must not be described as impossible to hack or fully POPIA compliant.

Existing controls include:

- HTTPS through Traefik.
- Company filtering in authenticated routes.
- Company-derived API access.
- Hashed API keys.
- HMAC-signed webhooks.
- Encrypted webhook secrets.
- Private object storage access through server routes.
- Random signer tokens.
- Explicit electronic-signing consent.
- PDF hashes and audit events.
- Private Docker networking for data services.

Important remaining work:

- Rotate all placeholder or exposed secrets.
- Stop using MinIO root credentials from the app. Use a bucket-restricted service account.
- Add MFA or passkeys.
- Add login throttling and lockouts.
- Move to revocable server-side sessions.
- Hash signer tokens in the database.
- Enforce signing-link expiry and revocation.
- Add optional email OTP for higher-risk documents.
- Add CSRF protection where appropriate.
- Add global CSP, HSTS and related browser security headers.
- Add malware scanning and stricter PDF validation.
- Disallow or sanitise SVG logos.
- Add API rate limits and scoped API permissions.
- Prevent webhook SSRF, private-address targets and DNS rebinding.
- Make security audit records append-only and copy them off-server.
- Encrypt and test off-server backups.
- Run containers as non-root with reduced capabilities and resource limits.
- Pin floating container image versions or digests.
- Add automated cross-company isolation tests.
- Arrange an independent penetration test before sensitive production use.

## 22. POPIA responsibilities

POPIA compliance is organisational as well as technical. Code changes alone cannot make BlendSign compliant.

Blend Property Group and Stor24 must determine and document:

- Responsible-party and operator roles.
- Information Officer registrations.
- Lawful processing purposes and bases.
- Privacy notices on public and signing forms.
- Data inventories and impact assessments.
- Retention and deletion periods.
- Data-subject access, correction, objection and deletion processes.
- Operator agreements with Hostinger, SMTP and other providers.
- Cross-border data locations and safeguards.
- Staff access, confidentiality and training.
- Incident response and Information Regulator notification procedures.

Do not use “POPIA compliant” as a marketing claim without a documented legal and operational assessment.

## 23. Coding invariants

Future changes must preserve these rules:

1. All company-owned authenticated queries are scoped to the active `orgId`.
2. API organisation identity comes from the API key, never the request body.
3. Signer tokens only expose the matching signer's envelope and fields.
4. Original and signed PDFs remain private objects.
5. Completed PDFs are immutable.
6. Existing envelopes are not retroactively changed when a template changes.
7. One person's signature or initials are never reused for another person.
8. Locked pre-filled values are enforced server-side, not only disabled in the browser.
9. Every signing request and completion has audit evidence.
10. Queue retries must be idempotent where external delivery is involved.
11. Secrets are never logged or committed.
12. Production schema changes must preserve existing data.

## 24. Working rules for another LLM

Before changing code:

1. Read this file completely.
2. Inspect `git status` and preserve unrelated user changes.
3. Confirm the exact active branch and remote head.
4. Read the relevant route, component, Prisma models and worker code.
5. Distinguish implemented behaviour from planned work.
6. Treat route handlers as security boundaries.
7. Use synthetic test data only.

When changing code:

1. Keep the change narrowly scoped.
2. Validate on both client and server, but trust only server validation.
3. Preserve company isolation in every query.
4. Avoid changing sealed-document semantics without an explicit migration and legal review.
5. Make external writes and queue handlers idempotent.
6. Update this file when architecture, deployment or completed feature status changes materially.

Before publishing:

1. Run Prisma validation and generation when the schema changes.
2. Run TypeScript and the full production build.
3. Run `git diff --check`.
4. Review every staged file explicitly.
5. Never stage unrelated files or secrets.
6. State whether the VPS requires an app build, worker build and database update.

## 25. Current next step

Task 1 is complete: the BlendSign integration is merged and production commit `ec21c93` was deployed by successful Actions run `32453728097` with backup, committed migration, app/worker rebuild and public health verification.

The immediate next stage is:

Task 2 is complete: a new Stor24-company API key and an active `envelope.completed` webhook for `https://stor24-site.srv938083.hstgr.cloud/api/webhooks/blendsign` were created on 21 August 2026. `BLENDSIGN_BASE_URL`, `BLENDSIGN_API_KEY` and `BLENDSIGN_WEBHOOK_SECRET` are stored as encrypted `blendproperty/stor24-portal` repository secrets and were written to `/opt/stor24-crm/.env` by successful configuration run `32454944047`. Secret values were neither logged nor committed. The older Stor24 API key was left intact because its consumers were not established.

Task 3 is complete: Stor24 portal routing merge `acfb8b8` was first deployed successfully by run `32452208716`. Verification run `32455134137` deployed exact portal commit `46b04d9`, built the app/migration images, reported all 22 migrations applied with none pending, recreated the app, passed its container health gate and returned the expected internal health response. An independent public request to `https://stor24-site.srv938083.hstgr.cloud/api/health` returned HTTP 200 with `service: stor24-crm` and `status: ok`. The production build contains `/api/webhooks/blendsign`. No customer or lease record was created during deployment verification.

Task 4 standard-lease UAT is complete. The original unit 104 run exposed the completion-webhook proxy defect; after its deployment, the disposable Unit 106 rerun proved the repaired end-to-end path. Envelope `cmt2r27ve008y2b2hro2xfphk` was sent at 11:31 on 21 August 2026, John Wayne signed at 11:36, Brett Dovey signed manually at 11:39, BlendSign reported `Completed normally`, and both recipients received the completed signed PDF. Stor24 account `ST24-MT2R27J7` changed from `DRAFT` to `ACTIVE`, linked Unit 106, showed `Active occupancy`, the B2 unit type and R100 monthly rent. Auto-countersigning remained off. This is the required activation proof; debit-order Task 5 may now begin.

Two blocking BlendSign improvements were added to the Task 4 remediation scope on 21 August 2026:

- Reports must show document source, template identity/version, recipient sent/viewed/signed timestamps, turnaround stages, current roadblock and matching CSV columns. New audit events record invitation delivery failures, completed-copy delivery failures, and webhook success/failure so operational delays are distinguishable from integration failures.
- Both Stor24 lease PDFs used legacy split date clauses ending in printed `20__`, which collided with BlendSign's complete date value. Corrected source PDFs replace those clauses with one full-date line; both live templates must be replaced and visually re-tested before UAT resumes.
- Template PDF replacement now preserves existing field placements and explicitly shows the preserved count for alignment review. Saving is blocked when a replacement has fewer pages than any preserved field, preventing an accidental fieldless or out-of-range revision.
- The blocking signer-experience subtask was deployed and its templates published on 21 August 2026. The Stor24 PDFs now print one primary `Mobile number` instead of duplicate telephone/mobile fields; the signer form presents mobile before address, offers a city dropdown with postal-code autofill (postal code remains editable), and explains `Signed at` as the town/city where the person signs. The final execution date is explicitly the date Stor24 countersigns/completes the agreement and belongs to the Stor24 Rep recipient in each template. The debit-order PDF contains two separate legacy full-date clauses (assignment page 7 and final execution page 8); both were corrected and visually verified. Live template evidence: standard `stor24-unit-lease` is revision 7 with 36 fields; debit order `stor24-unit-lease-debit-order` is revision 4 with 52 fields.
- During the Unit 106 standard-lease UAT, the signer form was further clarified: every required text, date, city, checkbox, signature and initials control uses the company's accent colour plus a visible `*`; optional controls have an explicit neutral `Optional` badge and neutral treatment; a compact legend explains both states. Validation/error styling remains distinct in red. This is a presentation-only change and does not weaken server-side required-field enforcement.
- Company-authorised countersigning is also code-complete locally: an organisation can upload private signature and initials assets, record the authorised representative, and enable permission in BlendSign; Stor24 has a separate per-facility Move In toggle. Both controls must be enabled before the API accepts an auto-sign recipient. Auto-signing records the representative/source in the audit trail, uses the stored assets only for the flagged Stor24 Rep, and runs after the Storer completes the prior signing tier. Both toggles remain off during manual UAT.
- The company-authorised signing setup now uses the same Type, Draw or Upload capture experience as recipient signing for both the stored signature and stored initials. Every method is normalised to PNG and saved through the existing private signing-asset endpoint; creating or replacing either asset still disables automation until the company setting is explicitly reviewed and enabled again.
- Task 5 debit-order UAT exposed signer-side control gaps before signing: Stor24-supplied commercial terms were visually presented like editable customer fields, debit amount could be changed, and bank/account/signing-location controls were free text. The remediation enforces facility, unit, size, rental, deposit, start/commencement date, debit amount and representative values as Stor24-controlled on both the signer UI and submission API (including already-created envelopes); adds a verified major-South-African-bank selector with universal branch-code population, an Other-bank fallback, account-type selection, signing-town/city suggestions with manual fallback, and a visible `Locked by Stor24` treatment. Complete Task 5 only after this remediation is deployed and the existing Unit 107 signing link is rechecked.
- The Task 5 bank selector was expanded from seven major banks to the union of the current SARB August 2026 settlement-bank population (excluding the SARB itself) and Nedbank Account Verification API's all-bank-identifier response, using familiar customer-facing brand names where applicable. Officially verified universal codes auto-populate and lock; listed institutions without a verified universal code require the customer to enter the applicable six-digit branch code. `Other bank` reveals separate mandatory bank-name and six-digit branch-code inputs instead of storing a generic Other value.
- Authorised company signature setup now stacks the signature and initials capture panels at full width. This prevents typed-style previews from being truncated in the narrower two-column company-settings layout while leaving the recipient signing layout unchanged.
- The company-authorised signing setup now mirrors recipient capture after saving: the private stored image is returned only through an authenticated administrator preview route, the UI shows the saved signature or initials plus an explicit Change action, and successful replacement returns to that preview. Additional spacing separates representative details from the signing-asset cards.
- The automatic-company-signing permission is presented as a proper accessible switch rather than a silently disabled checkbox. It remains interactive: if the stored assets exist but the representative name is missing, switching it on explains that exact prerequisite; once ready, it clearly states that Save settings is required to activate the change.
- Task 5 Unit 103 exposed repeated signer inputs because a single merge key is placed at multiple PDF positions. The signer experience now renders only one input per repeated data key, synchronises that value to every placement, and rejects mismatched repeated values server-side. Individual debit-order contact person defaults to the Storer name but remains editable for a company or different contact. Signature-date fields are system-derived using the current Africa/Johannesburg date, visibly read-only and normalised again by the signing API; `final execution` is the date the final party completes the agreement, not the future occupation date.
- Signer PDF access now distinguishes review from execution. Until the envelope is completed, the tokenized document route generates a non-cached review PDF with the organisation accent colour, a large `UNSIGNED DRAFT` / `NOT A VALID OR EXECUTED AGREEMENT` watermark on every page, a coloured review-only footer, the envelope reference and generation timestamp, and wording that authentic completed copies are issued and verifiable through BlendSign. Once sealing has completed, the signer screen polls a minimal token-scoped status endpoint and changes automatically to the immutable `signedKey` PDF. The document URL carries its requested state: an `unsigned-review` URL always returns the watermarked original even if completion happens in the background, while a `completed` URL returns only the sealed PDF and responds `409` until it is ready. This prevents a stale unsigned-review label from opening a completed document. Browser controls cannot prevent screenshots or technical extraction; the protection is the unmistakable document state plus the sealed final hash and audit trail.
- Unit 101 provided live production evidence for this document-state control on 21 August 2026. The Storer completed signing and Stor24 auto-sign/sealing completed in the background. The first release correctly returned the sealed PDF but left the already-rendered button labelled `View unsigned review`; this was a presentation/state-contract defect, not an unsigned-file leak. Commit `0b8b83c` added two-second token-scoped completion polling and state-locked document URLs. Production run `32483284542` deployed it successfully. An unsigned-review URL can now return only the watermarked original, and a completed URL can return only the sealed `signedKey` PDF. Task 5 remains open until Stor24 account activation, final field values and completed-copy delivery are explicitly evidenced.

1. Run debit-order Task 5 using live template v4/52 fields: require its banking fields, visually confirm the new required/optional UI, complete Signer 1 then Stor24 Rep, deliver a valid signed webhook and prove the same activation invariants.
2. Negative-test invalid webhook signatures, unknown merge keys, missing recipient roles and a simulated BlendSign outage; verify failures remain visible and reconcilable without creating duplicate envelopes.
3. Verify replay/idempotency for the Task 4 completion webhook against the retained Unit 106 evidence without duplicating occupancy, tenancy or envelope records.
4. Add secure completed-PDF/certificate retrieval and the Stor24 tenant/lease Documents UI; this remains an implementation gap, not merely a test.

Production customer records must not be used for the first verification. Clean up disposable records only after evidence has been retained.
