"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar, NavbarStart, NavbarCenter, NavbarEnd, Button } from "@wizeworks/silicaui-react";
import { Mark, MenuIcon, CloseIcon } from "@make-it-social/ui/icons";

const NAV = [
  { label: "Product", href: "#product" },
  { label: "Solutions", href: "#workflow" },
  { label: "Pricing", href: "/pricing" },
  { label: "Resources", href: "#resources" },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-base-300 bg-base-100/95 backdrop-blur-sm">
      <Navbar className="page-container min-h-18">
        <NavbarStart>
          <Link
            href="/"
            className="flex items-center gap-2.5 font-bold tracking-tight"
            aria-label="Make It Social home"
          >
            <Mark size={30} />
            <span className="text-lg">Make It Social</span>
          </Link>
        </NavbarStart>

        <NavbarCenter className="hidden lg:flex">
          <nav aria-label="Primary" className="flex items-center gap-1">
            {NAV.map((item) => (
              <Button key={item.label} variant="ghost" color="neutral" render={<Link href={item.href} />}>
                {item.label}
              </Button>
            ))}
          </nav>
        </NavbarCenter>

        <NavbarEnd className="gap-2">
          <Button variant="ghost" color="neutral" className="hidden h-11 sm:inline-block" render={<Link href="/login" />}>
            Log in
          </Button>
          <Button color="primary" className="hidden h-11 sm:inline-block" render={<Link href="/signup" />}>
            Start free trial
          </Button>
          <Button
            variant="ghost"
            color="neutral"
            shape="square"
            className="lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </Button>
        </NavbarEnd>
      </Navbar>

      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-base-300 bg-base-100 lg:hidden">
          <div className="page-container flex flex-col gap-1 py-4">
            {NAV.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-field px-3 py-3 text-base font-semibold hover:bg-base-200"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2 sm:hidden">
              <Button color="primary" size="lg" render={<Link href="/signup" />}>
                Start free trial
              </Button>
              <Button variant="outline" color="neutral" size="lg" render={<Link href="/login" />}>
                Log in
              </Button>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
