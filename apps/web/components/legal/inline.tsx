import { Fragment } from "react";
import Link from "next/link";

/** Matches `[label](href)` and `**bold**` so legal copy stays plain strings. */
const TOKEN = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g;

export function Inline({ text }: { text: string }) {
  const parts = text.split(TOKEN).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{renderToken(part)}</Fragment>
      ))}
    </>
  );
}

function renderToken(part: string) {
  const bold = /^\*\*([^*]+)\*\*$/.exec(part);
  if (bold) return <strong className="font-semibold text-base-content">{bold[1]}</strong>;

  const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
  if (!link) return part;

  const [, label, href] = link;
  const className = "font-medium text-base-content underline underline-offset-3 hover:no-underline";
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {label}
      </Link>
    );
  }
  const external = href.startsWith("http");
  return (
    <a href={href} className={className} {...(external && { target: "_blank", rel: "noopener noreferrer" })}>
      {label}
    </a>
  );
}
