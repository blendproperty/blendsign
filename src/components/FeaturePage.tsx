import Link from "next/link";
import { Icon, IconName } from "./Icon";

export default function FeaturePage({
  eyebrow,
  title,
  description,
  icon,
  bullets,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: IconName;
  bullets: string[];
  action: string;
}) {
  return (
    <div className="page feature-page">
      <section className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></section>
      <section className="feature-hero panel">
        <div className="feature-art" aria-hidden="true">
          <div className="feature-art-orbit feature-art-orbit--one" />
          <div className="feature-art-orbit feature-art-orbit--two" />
          <span className="feature-art-icon"><Icon name={icon} size={54} /></span>
          <span className="feature-art-doc"><Icon name="file" size={32} /></span>
          <span className="feature-art-check"><Icon name="check" size={18} /></span>
        </div>
        <div className="feature-copy">
          <span className="feature-badge">BlendSign workspace</span>
          <h2>{title}, built around your property workflow.</h2>
          <p>{description}</p>
          <ul>{bullets.map((bullet) => <li key={bullet}><Icon name="check" size={17} />{bullet}</li>)}</ul>
          <Link href="/new" className="button button--dark">{action}<Icon name="chevron" size={17} /></Link>
        </div>
      </section>
    </div>
  );
}
