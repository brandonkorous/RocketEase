import { BrandPanel } from "@/components/auth/brand-panel";
import { SplitShell } from "@/components/split-shell";

/** Split screen: brand panel left, form card right (auth mockup). Stacks on small screens. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <SplitShell panel={<BrandPanel />}>{children}</SplitShell>;
}
