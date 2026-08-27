const stor24ControlledKeys = new Set([
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

export function isStor24ControlledField(dataKey: string | null | undefined) {
  return Boolean(dataKey && stor24ControlledKeys.has(dataKey));
}
