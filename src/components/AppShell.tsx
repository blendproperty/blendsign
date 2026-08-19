"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, IconName } from "./Icon";

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
      { heading: "General", label: "My profile", href: "/settings#profile" },
      { label: "Integrations", href: "/settings#integrations" },
      { label: "My notifications", href: "/settings#notifications" },
      { label: "Contacts", href: "/settings#contacts" },
      { label: "Trash", href: "/settings#trash" },
      { heading: "Admin", label: "Users and access", href: "/settings#users" },
      { label: "Account settings", href: "/settings#account" },
      { label: "Branding", href: "/settings#branding" },
    ],
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setDrawer(null);
    setMobileOpen(false);
  }, [pathname]);

  if (pathname.startsWith("/sign/")) return <>{children}</>;

  const current = nav.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

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
          <Link href="/dashboard" className="brand-lockup">
            <span className="brand-name">blend</span>
            <span className="brand-product">SIGN</span>
          </Link>
          <div className="top-bar-actions">
            <label className="search-box">
              <Icon name="search" size={18} />
              <input placeholder="Search documents" aria-label="Search documents" />
              <kbd>⌘ K</kbd>
            </label>
            <button className="icon-button" aria-label="Notifications"><Icon name="bell" size={19} /></button>
            <div className="top-divider" />
            <button className="account-switcher">
              <span className="account-avatar">BP</span>
              <span className="account-copy"><strong>Blend Property Group</strong><small>Administrator</small></span>
              <Icon name="chevron" size={15} />
            </button>
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
