"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, IconName } from "./Icon";
import { BlendSignLogo } from "./BlendSignLogo";

type NavItem = {
  label: string;
  href: string;
  icon: IconName;
  drawer?: { heading?: string; label: string; href: string }[];
};

const nav: NavItem[] = [
  { label: "Sign", href: "/dashboard", icon: "home" },
  {
    label: "Documents",
    href: "/documents",
    icon: "documents",
    drawer: [
      { heading: "Sent", label: "All", href: "/documents" },
      { label: "Scheduled", href: "/documents?status=scheduled" },
      { label: "In progress", href: "/documents?status=in-progress" },
      { label: "Completed", href: "/documents?status=completed" },
      { label: "Declined", href: "/documents?status=declined" },
      { label: "Expired", href: "/documents?status=expired" },
      { label: "Recalled", href: "/documents?status=recalled" },
      { label: "Draft", href: "/documents?status=draft" },
      { label: "Bulk send", href: "/documents?status=bulk" },
      { heading: "Received", label: "All", href: "/documents?scope=received" },
      { label: "Needs your action", href: "/documents?status=action" },
    ],
  },
  { label: "Templates", href: "/templates", icon: "template" },
  { label: "SignForms", href: "/signforms", icon: "link" },
  { label: "Reports", href: "/reports", icon: "report" },
  {
    label: "Settings",
    href: "/settings",
    icon: "settings",
    drawer: [
      { heading: "General", label: "My profile", href: "/settings/profile" },
      { label: "Integrations", href: "/settings/integrations" },
      { label: "Contacts", href: "/settings/contacts" },
      { label: "Trash", href: "/settings/trash" },
      { heading: "Admin", label: "Users and access", href: "/settings/users" },
      { label: "Companies", href: "/settings/entities" },
      { label: "Branding", href: "/settings/branding" },
    ],
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [account, setAccount] = useState<{ user: { name: string }; entity: { id: string; name: string; logoKey?: string | null; logoUrl?: string | null; updatedAt?: string }; entities: { id: string; name: string; logoKey?: string | null; logoUrl?: string | null; updatedAt?: string }[] } | null>(null);
  const publicPage = pathname === "/login" || pathname.startsWith("/sign/") || pathname.startsWith("/form/");

  useEffect(() => {
    setDrawer(null);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (publicPage) return;
    fetch("/api/auth/me").then(async (response) => {
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (response.ok) setAccount(await response.json());
    });
  }, [publicPage, router]);

  if (publicPage) return <>{children}</>;
  if (!account) return <div className="app-loading"><BlendSignLogo /></div>;

  async function selectEntity(entityId: string) {
    const response = await fetch("/api/settings/entities/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entityId }) });
    if (response.ok) {
      const entity = account?.entities.find((item) => item.id === entityId);
      if (entity) setAccount((current) => current ? { ...current, entity } : current);
      router.refresh();
      window.location.reload();
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const current = nav.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const activeLogo = account.entity.logoKey ? `/api/brand/${account.entity.id}/logo?v=${account.entity.updatedAt ? new Date(account.entity.updatedAt).getTime() : ""}` : account.entity.logoUrl;

  return (
    <div className="app-shell">
      <aside className={`side-rail ${mobileOpen ? "side-rail--open" : ""}`}>
        <Link href="/dashboard" className="rail-mark" aria-label="BlendSign home">
          <span>B</span>
        </Link>
        <nav className="rail-nav" aria-label="Primary navigation">
          {nav.map((item) => {
            const active = current?.label === item.label;
            return (
              <div
                className="rail-item-wrap"
                key={item.label}
                onMouseEnter={() => item.drawer && setDrawer(item.label)}
                onMouseLeave={() => item.drawer && setDrawer(null)}
              >
                <Link
                  href={item.href}
                  className={`rail-item ${active ? "is-active" : ""}`}
                  onFocus={() => item.drawer && setDrawer(item.label)}
                >
                  <Icon name={item.icon} size={21} />
                  <span>{item.label}</span>
                </Link>
                {item.drawer && drawer === item.label && (
                  <div className="nav-drawer">
                    {item.drawer.map((entry, index) => (
                      <div key={`${entry.label}-${index}`}>
                        {entry.heading && <p className="nav-drawer-heading">{entry.heading}</p>}
                        <Link href={entry.href}>{entry.label}</Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <Link href="/new" className="rail-create" aria-label="Create new envelope">
          <Icon name="plus" size={25} />
        </Link>
      </aside>

      <div className="app-stage">
        <header className="top-bar">
          <button className="mobile-menu" onClick={() => setMobileOpen((value) => !value)} aria-label="Toggle menu">
            <Icon name={mobileOpen ? "close" : "menu"} />
          </button>
          <Link href="/dashboard" className="brand-lockup" aria-label="BlendSign home">
            <BlendSignLogo />
          </Link>
          <div className="top-bar-actions">
            <label className="search-box">
              <Icon name="search" size={18} />
              <input placeholder="Search documents" aria-label="Search documents" />
              <kbd>⌘ K</kbd>
            </label>
            <button className="icon-button" aria-label="Notifications"><Icon name="bell" size={19} /></button>
            <div className="top-divider" />
            <div className="account-switcher">
              <span className="account-avatar">{activeLogo ? <img src={activeLogo} alt="" /> : account.entity.name.split(" ").map((word) => word[0]).join("").slice(0, 2).toUpperCase()}</span>
              <span className="account-copy"><strong>{account.entity.name}</strong><small>{account.user.name}</small></span>
              <select aria-label="Active company" value={account.entity.id} onChange={(event) => selectEntity(event.target.value)}>
                {account.entities.map((entity) => <option value={entity.id} key={entity.id}>{entity.name}</option>)}
              </select>
            </div>
            <button className="icon-button" onClick={logout} aria-label="Sign out"><Icon name="close" size={18} /></button>
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
