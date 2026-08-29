import { appPath } from "./site";

export type NavLink = { label: string; href: string };
export type NavColumn = { title: string; links: NavLink[] };

/** Primary header navigation. Menus mirror the footer columns. */
export const PRODUCT_LINKS: NavLink[] = [
  { label: "Features", href: "/features" },
  { label: "Integrations", href: "/integrations" },
  { label: "What's new", href: "/changelog" },
  { label: "Roadmap", href: "/roadmap" },
];

export const SOLUTION_LINKS: NavLink[] = [
  { label: "Agencies", href: "/solutions/agencies" },
  { label: "Small business", href: "/solutions/small-business" },
  { label: "Ecommerce", href: "/solutions/ecommerce" },
  { label: "Multi-location", href: "/solutions/multi-location" },
];

export const RESOURCE_LINKS: NavLink[] = [
  { label: "Blog", href: "/blog" },
  { label: "Guides", href: "/guides" },
  { label: "Templates", href: "/templates" },
  { label: "Help center", href: "/help" },
  { label: "API / Developers", href: "/developers" },
];

export const COMPANY_LINKS: NavLink[] = [
  { label: "About", href: "/about" },
  { label: "Careers", href: "/careers" },
  { label: "Partners", href: "/partners" },
  { label: "Contact", href: "/contact" },
];

export const LEGAL_LINKS: NavLink[] = [
  { label: "Privacy policy", href: "/privacy" },
  { label: "Terms of service", href: "/terms" },
  { label: "Acceptable use", href: "/acceptable-use" },
  { label: "Data processing (DPA)", href: "/dpa" },
  { label: "Subprocessors", href: "/subprocessors" },
  { label: "Copyright / DMCA", href: "/copyright" },
  { label: "Cookies", href: "/cookies" },
  { label: "Security", href: "/security" },
];

export const FOOTER_COLUMNS: NavColumn[] = [
  { title: "Product", links: [...PRODUCT_LINKS.slice(0, 2), { label: "Pricing", href: "/pricing" }, ...PRODUCT_LINKS.slice(2)] },
  { title: "Solutions", links: SOLUTION_LINKS },
  { title: "Resources", links: [...RESOURCE_LINKS, { label: "Status", href: "/status" }] },
  { title: "Company", links: COMPANY_LINKS },
  { title: "Legal", links: LEGAL_LINKS },
];

/** Bottom row. "Your privacy choices" is a state-privacy opt-out surface, not a policy. */
export const FOOTER_BOTTOM: NavLink[] = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Accessibility", href: "/accessibility" },
  { label: "Your privacy choices", href: "/privacy-choices" },
];

export const AUTH_LINKS = {
  login: appPath("/login"),
  signup: appPath("/signup"),
} as const;
