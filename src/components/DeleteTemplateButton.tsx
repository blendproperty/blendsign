"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteTemplateButton({
  id,
  name,
  signFormCount,
}: {
  id: string;
  name: string;
  signFormCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    const linkedForms = signFormCount
      ? ` This will also permanently delete ${signFormCount} linked SignForm${signFormCount === 1 ? "" : "s"}.`
      : "";
    if (!window.confirm(`Permanently delete the template \"${name}\"?${linkedForms} Existing documents created from it will not be deleted.`)) return;

    setBusy(true);
    try {
      const response = await fetch(`/api/templates/${id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The template could not be deleted.");
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The template could not be deleted.");
      setBusy(false);
    }
  }

  return (
    <button type="button" className="text-button text-button--danger template-delete" onClick={remove} disabled={busy}>
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
