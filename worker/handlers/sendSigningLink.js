function createSendSigningLinkHandler({ prisma, sendSigningLinkEmail, fetchImpl = fetch, env = process.env }) {
  return async function handleSendSigningLink({ signerId }) {
    const signer = await prisma.signer.findUnique({
      where: { id: signerId },
      include: { envelope: { include: { org: true } } },
    });
    if (!signer) return;

    const appDomain = signer.envelope.org.customDomain || env.APP_DOMAIN || "localhost:3000";
    const baseUrl = /^https?:\/\//i.test(appDomain) ? appDomain.replace(/\/$/, "") : `https://${appDomain.replace(/\/$/, "")}`;
    const link = `${baseUrl}/sign/${signer.token}`;

    try {
      if (signer.email) {
        await sendSigningLinkEmail({
          to: signer.email,
          signerName: signer.name,
          documentTitle: signer.envelope.title,
          link,
          organisation: signer.envelope.org,
        });
      } else if (signer.phone) {
        const message = `${signer.name}, ${signer.envelope.org.name} has asked you to sign "${signer.envelope.title}": ${link}`;
        if (env.WHATSAPP_BUSINESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_API_VERSION) {
          const response = await fetchImpl(`https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
            method: "POST",
            headers: { authorization: `Bearer ${env.WHATSAPP_BUSINESS_TOKEN}`, "content-type": "application/json" },
            body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: signer.phone.replace(/\D/g, ""), type: "text", text: { preview_url: false, body: message } }),
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok) throw new Error(`WhatsApp delivery failed with HTTP ${response.status}`);
        } else {
          const waLink = `https://wa.me/${signer.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
          console.log("WhatsApp delivery (manual fallback):", waLink);
        }
      } else {
        throw new Error("Signer has no email or phone");
      }
    } catch (error) {
      await prisma.auditEvent.create({ data: { envelopeId: signer.envelopeId, signerId, eventType: "delivery_failed", metadata: { message: error instanceof Error ? error.message : String(error) } } });
      throw error;
    }

    await prisma.auditEvent.create({ data: { envelopeId: signer.envelopeId, signerId, eventType: "sent" } });
  };
}

module.exports = { createSendSigningLinkHandler };
