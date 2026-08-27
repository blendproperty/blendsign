const stor24ControlledKeys = new Set([
  "owner.companyName",
  "owner.registrationNumber",
  "owner.address",
  "owner.city",
  "owner.postalCode",
  "owner.phone",
  "owner.vatNumber",
  "owner.email",
  "facility.name",
  "unit.number",
  "unit.size",
  "lease.startDate",
  "lease.monthlyRental",
  "lease.deposit",
  "payment.debitOrder",
  "debit.commencementDate",
  "debit.amount",
  "stor24.representativeName",
]);

// Payment authority must come from the signer. These fields may never be
// rendered read-only because Stor24 does not know (and should not silently
// supply) the customer's bank-account details.
const signerSuppliedKeys = new Set([
  "debit.bankName",
  "debit.branchName",
  "debit.branchCode",
  "debit.accountName",
  "debit.accountNumber",
  "debit.accountType",
]);

export function isStor24ControlledField(dataKey: string | null | undefined) {
  return Boolean(dataKey && stor24ControlledKeys.has(dataKey));
}

export function isSignerSuppliedField(dataKey: string | null | undefined) {
  return Boolean(dataKey && signerSuppliedKeys.has(dataKey));
}

export function signerCanEditField(input: {
  editableBySigner: boolean;
  externalSystem: string | null | undefined;
  dataKey: string | null | undefined;
}) {
  if (isSignerSuppliedField(input.dataKey)) return true;
  if (input.externalSystem === "stor24" && isStor24ControlledField(input.dataKey)) return false;
  return input.editableBySigner;
}
