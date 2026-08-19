import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ENTITY_COOKIE, getAdminSession } from "@/lib/auth";

export const DEFAULT_ORG_ID = "demo-org";
export const DEFAULT_USER_ID = "demo-user";

export async function ensureDefaultAccount() {
  const email = (process.env.ADMIN_EMAIL || process.env.SMTP_USER || "admin@blendproperty.co.za").toLowerCase();
  const org = await prisma.org.upsert({
    where: { id: DEFAULT_ORG_ID },
    update: {},
    create: {
      id: DEFAULT_ORG_ID,
      name: "Blend Property Group",
      email,
      emailFromName: "Blend Property Group",
    },
  });
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const existingBootstrapUser = await prisma.user.findUnique({ where: { id: DEFAULT_USER_ID } });
    user = existingBootstrapUser
      ? await prisma.user.update({ where: { id: DEFAULT_USER_ID }, data: { orgId: org.id, email, role: "owner" } })
      : await prisma.user.create({ data: { id: DEFAULT_USER_ID, orgId: org.id, email, name: "Administrator", role: "owner" } });
  }
  await prisma.orgMembership.upsert({
    where: { orgId_userId: { orgId: org.id, userId: user.id } },
    update: { role: "owner" },
    create: { orgId: org.id, userId: user.id, role: "owner" },
  });
  return { org, user };
}

export async function getRequestContext() {
  const session = getAdminSession();
  if (!session) return null;
  const bootstrap = await ensureDefaultAccount();
  const selectedId = cookies().get(ENTITY_COOKIE)?.value;
  let org = selectedId ? await prisma.org.findUnique({ where: { id: selectedId } }) : null;
  let membership = org ? await prisma.orgMembership.findUnique({
    where: { orgId_userId: { orgId: org.id, userId: session.userId } },
  }) : null;
  if (org && !session.superAdmin) {
    if (!membership) org = null;
  }
  if (!org && !session.superAdmin) {
    const firstMembership = await prisma.orgMembership.findFirst({
      where: { userId: session.userId },
      include: { org: true },
      orderBy: { createdAt: "asc" },
    });
    org = firstMembership?.org || null;
    membership = firstMembership || null;
  }
  org ||= bootstrap.org;
  if (!membership && org) {
    membership = await prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId: org.id, userId: session.userId } },
    });
  }
  const user = await prisma.user.findUnique({ where: { id: session.userId } }) || bootstrap.user;
  return { session, org, user, role: session.superAdmin ? "owner" : membership?.role || "member" };
}

export function canAdminister(context: NonNullable<Awaited<ReturnType<typeof getRequestContext>>>) {
  return context.session.superAdmin || context.role === "owner" || context.role === "admin";
}

export async function listAccessibleOrgs() {
  const context = await getRequestContext();
  if (!context) return [];
  if (context.session.superAdmin) return prisma.org.findMany({ orderBy: { name: "asc" } });
  const memberships = await prisma.orgMembership.findMany({
    where: { userId: context.user.id },
    include: { org: true },
    orderBy: { org: { name: "asc" } },
  });
  return memberships.map((membership) => membership.org);
}
