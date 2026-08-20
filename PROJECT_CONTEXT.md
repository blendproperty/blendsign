# BlendSign project context

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

Current deployment branch:

```text
agent/blendsign-admin-redesign
```

Current production hostname:

```text
https://blendsign.srv938083.hstgr.cloud
```

The production checkout is normally located at:

```text
/root/blendsign
```

Do not assume the organisation repository's `main` branch contains the latest production work. Confirm the active fork branch and current VPS commit before making or deploying changes.

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

The API currently does not create an envelope from a template. Do not claim that Stor24 automation is complete until the endpoint in section 17 is implemented and tested.

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

### 17.1 Next API endpoint

The next implementation stage should add:

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
      "role": "Tenant",
      "name": "Example Tenant",
      "email": "tenant@example.test"
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

The Stor24 portal still needs:

- A server-only BlendSign API client.
- Secure environment variables for the base URL and API key.
- Field mapping from Stor24 tenant, unit and lease records.
- Storage of the BlendSign envelope ID.
- A verified webhook receiver.
- A tenant or lease Documents section.
- Secure completed-PDF and certificate retrieval.
- Retry and reconciliation handling.

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

The VPS normally receives the active fork branch with:

```bash
cd /root/blendsign

git fetch https://github.com/doveydragon/blendsign.git \
  agent/blendsign-admin-redesign

git merge --ff-only FETCH_HEAD
git log -1 --oneline
```

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

For Prisma schema changes, run the database update after building and before recreating the services:

```bash
docker compose run --rm --no-deps app npx prisma db push
```

Then verify:

```bash
docker compose ps
docker compose logs --tail=60 app worker
curl -Ik https://blendsign.srv938083.hstgr.cloud/templates
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

The immediate next development stage is the secure Stor24 create-from-template API described in section 17.1.

Do not begin by changing the Stor24 website. BlendSign must first expose a tested, company-scoped and idempotent document-generation contract. After that contract is stable, implement the server-side connector and Documents section in `blendproperty/stor24-portal`.
