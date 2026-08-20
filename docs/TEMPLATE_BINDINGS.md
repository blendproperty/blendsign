# Template API bindings

BlendSign templates belong to one organisation and expose a permanent, organisation-scoped API identifier. External systems refer to a template by this identifier rather than its database ID or editable display name.

Example:

```text
stor24-unit-lease
```

The same identifier cannot be used twice within one organisation. Once assigned, it cannot be changed. Saving an existing template increments its revision number. Existing envelopes retain their copied PDF, fields and audit metadata.

## Field metadata

Text, date and checkbox fields may define:

- `label`, the human-readable name shown to a signer.
- `dataKey`, the dotted key an API request will populate.
- `defaultValue`, the fallback when no API value is supplied.
- `required`, whether signing may complete without a value.
- `editableBySigner`, whether the signer may change a pre-filled value.

Signature and initials fields are always completed by their assigned signer and do not accept data keys or default values.

Repeated data keys are intentional. If `tenant.fullName` appears in three PDF positions, a future create-from-template request will populate all three fields.

## Stor24 starter mapping

| PDF value | Data key |
| --- | --- |
| Tenant full name | `tenant.fullName` |
| South African ID or passport number | `tenant.idNumber` |
| Email address | `tenant.email` |
| Mobile number | `tenant.phone` |
| Unit number | `unit.number` |
| Unit size | `unit.size` |
| Lease start date | `lease.startDate` |
| Monthly rental | `lease.monthlyRental` |

The create-from-template API that consumes these keys is the next integration stage.
