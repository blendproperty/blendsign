"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, IconName } from "@/components/Icon";

const groups: { title: string; items: { label: string; href: string; icon: IconName }[] }[] = [
  { title: "Your account", items: [
    { label: "My profile", href: "/settings/profile", icon: "users" },
    { label: "Contacts", href: "/settings/contacts", icon: "documents" },
    { label: "Trash", href: "/settings/trash", icon: "file" },
  ] },
  { title: "Company administration", items: [
    { label: "Companies", href: "/settings/entities", icon: "home" },
    { label: "Users and access", href: "/settings/users", icon: "shield" },
    { label: "Branding and legal", href: "/settings/branding", icon: "template" },
    { label: "Integrations and API", href: "/settings/integrations", icon: "link" },
  ] },
];

export default function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="settings-layout">
      <aside className="settings-nav">
        <div className="settings-nav-title"><p className="eyebrow">Administration</p><h1>Settings</h1></div>
        {groups.map((group) => (
          <div className="settings-nav-group" key={group.title}>
            <p>{group.title}</p>
            {group.items.map((item) => <Link className={pathname === item.href ? "is-active" : ""} href={item.href} key={item.href}><Icon name={item.icon} size={17} />{item.label}</Link>)}
          </div>
        ))}
      </aside>
      <div className="settings-content">{children}</div>
    </div>
  );
}
