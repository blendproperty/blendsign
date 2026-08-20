import SettingsShell from "@/components/SettingsShell";
import { requirePageSession } from "@/lib/auth";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  requirePageSession();
  return <SettingsShell>{children}</SettingsShell>;
}
