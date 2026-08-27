-- Populate the Owner's details block on both Stor24 lease templates.
-- These values are supplied by Stor24 from the selected facility's Store Information profile.
WITH owner_fields("suffix", "label", "dataKey", "x", "y", "width", "height") AS (
  VALUES
    ('company',      'Owner company',             'owner.companyName',        0.126, 0.299, 0.310, 0.020),
    ('registration', 'Owner registration number', 'owner.registrationNumber', 0.509, 0.299, 0.310, 0.020),
    ('address',      'Owner physical address',    'owner.address',            0.126, 0.350, 0.310, 0.020),
    ('phone',        'Owner mobile number',        'owner.phone',              0.657, 0.350, 0.168, 0.020),
    ('city',         'Owner city',                 'owner.city',               0.164, 0.386, 0.306, 0.020),
    ('postal',       'Owner postal code',          'owner.postalCode',         0.524, 0.400, 0.301, 0.020),
    ('vat',          'Owner VAT number',           'owner.vatNumber',          0.126, 0.451, 0.310, 0.020),
    ('email',        'Owner email address',        'owner.email',              0.178, 0.487, 0.305, 0.020)
)
INSERT INTO "TemplateField" (
  "id", "templateId", "roleId", "type", "label", "dataKey", "defaultValue",
  "editableBySigner", "page", "x", "y", "width", "height", "required"
)
SELECT
  'stor24-owner-' || f."suffix" || '-' || md5(t."id"),
  t."id",
  r."id",
  'TEXT'::"FieldType",
  f."label",
  f."dataKey",
  NULL,
  FALSE,
  1,
  f."x",
  f."y",
  f."width",
  f."height",
  FALSE
FROM "Template" t
JOIN "TemplateRole" r ON r."templateId" = t."id" AND r."name" = 'Signer 1'
CROSS JOIN owner_fields f
WHERE t."apiIdentifier" IN ('stor24-unit-lease', 'stor24-unit-lease-debit-order')
  AND NOT EXISTS (
    SELECT 1 FROM "TemplateField" existing
    WHERE existing."templateId" = t."id" AND existing."dataKey" = f."dataKey"
  );
