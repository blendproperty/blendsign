import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  // Placeholder: no auth wired yet — org scoping to be added with auth.
  const envelopes = await prisma.envelope.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { signers: true },
  });

  return (
    <main style={{ maxWidth: 960, margin: "40px auto", padding: "0 24px" }}>
      <h1>Envelopes</h1>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Title</th>
            <th align="left">Status</th>
            <th align="left">Signers</th>
            <th align="left">Created</th>
          </tr>
        </thead>
        <tbody>
          {envelopes.map((e) => (
            <tr key={e.id}>
              <td>{e.title}</td>
              <td>{e.status}</td>
              <td>{e.signers.length}</td>
              <td>{e.createdAt.toISOString().slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
