import { NextResponse } from "next/server";
import { getRequestContext, listAccessibleOrgs } from "@/lib/account";

export async function GET() {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const entities = await listAccessibleOrgs();
  return NextResponse.json({
    user: { id: context.user.id, name: context.user.name, email: context.user.email },
    entity: context.org,
    entities,
    superAdmin: context.session.superAdmin,
  });
}
