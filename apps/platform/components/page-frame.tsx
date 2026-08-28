import Link from "next/link";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { EmptyState } from "@wizeworks/silicaui-react";

type Action = { label: string; href: string };

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="app-title">{title}</h1>
        {description && <p className="mt-1 text-base text-secondary">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Designed empty state (onboarding.md): what this area is, why it is empty,
 * one primary action, one learning path. Never masks an error as emptiness.
 */
export function PageEmpty({
  icon,
  title,
  description,
  primary,
  secondary,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  primary?: Action;
  secondary?: Action;
}) {
  return (
    <div className="mt-8 rounded-box border border-base-300 py-16">
      <EmptyState
        icon={icon}
        title={title}
        description={<span className="mx-auto block max-w-110">{description}</span>}
        actions={
          <>
            {primary && (
              <Link href={primary.href} className={buttonClasses({ color: "primary" })}>
                {primary.label}
              </Link>
            )}
            {secondary && (
              <Link href={secondary.href} className={buttonClasses({ color: "neutral", variant: "ghost" })}>
                {secondary.label}
              </Link>
            )}
          </>
        }
      />
    </div>
  );
}

export function AppPage({ children }: { children: React.ReactNode }) {
  return <div className="app-page mx-auto w-full max-w-360">{children}</div>;
}
