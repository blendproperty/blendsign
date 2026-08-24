type SignerCandidate = { id: string; order: number; status: string; email: string | null; autoSign: boolean };

export function eligibleSigningReminderRecipients(signers: SignerCandidate[]) {
  const incomplete = signers.filter((signer) => signer.status !== "SIGNED" && signer.status !== "DECLINED");
  if (!incomplete.length) return [];
  const activeOrder = Math.min(...incomplete.map((signer) => signer.order));
  return incomplete.filter((signer) => signer.order === activeOrder && !signer.autoSign && Boolean(signer.email));
}
