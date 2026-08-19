import { Icon } from "@/components/Icon";

const settings = [
  { id: "profile", icon: "users" as const, title: "Profile", copy: "Your name, role and contact details." },
  { id: "integrations", icon: "link" as const, title: "Integrations", copy: "Connect delivery, storage and property systems." },
  { id: "notifications", icon: "bell" as const, title: "Notifications", copy: "Choose which signing events reach you." },
  { id: "users", icon: "shield" as const, title: "Users and access", copy: "Manage people, roles and workspace permissions." },
  { id: "account", icon: "settings" as const, title: "Account settings", copy: "Organisation details and document defaults." },
  { id: "branding", icon: "template" as const, title: "Branding", copy: "Document emails, colours and signing identity." },
];

export default function Settings() {
  return (
    <div className="page">
      <section className="page-heading"><p className="eyebrow">Administration</p><h1>Settings</h1><p>Control your BlendSign workspace, users and organisation defaults.</p></section>
      <section className="settings-grid">
        {settings.map((item) => <a href={`#${item.id}`} id={item.id} className="settings-card panel" key={item.id}><span><Icon name={item.icon} size={23} /></span><div><h2>{item.title}</h2><p>{item.copy}</p></div><Icon name="chevron" size={18} /></a>)}
      </section>
    </div>
  );
}
