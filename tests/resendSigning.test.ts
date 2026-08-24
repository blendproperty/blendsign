import assert from "node:assert/strict";
import test from "node:test";
import { eligibleSigningReminderRecipients } from "../src/lib/resendSigning.ts";

test("reminders target only the current routing tier", () => {
  const signers = [
    { id: "storer", order: 1, status: "PENDING", email: "storer@example.com", autoSign: false },
    { id: "representative", order: 2, status: "PENDING", email: "rep@example.com", autoSign: false },
  ];
  assert.deepEqual(eligibleSigningReminderRecipients(signers).map((signer) => signer.id), ["storer"]);
});

test("signed earlier tiers advance reminders to the next tier", () => {
  const signers = [
    { id: "storer", order: 1, status: "SIGNED", email: "storer@example.com", autoSign: false },
    { id: "representative", order: 2, status: "VIEWED", email: "rep@example.com", autoSign: false },
  ];
  assert.deepEqual(eligibleSigningReminderRecipients(signers).map((signer) => signer.id), ["representative"]);
});

test("automatic signers never receive reminder emails", () => {
  const signers = [{ id: "representative", order: 1, status: "PENDING", email: "rep@example.com", autoSign: true }];
  assert.deepEqual(eligibleSigningReminderRecipients(signers), []);
});
