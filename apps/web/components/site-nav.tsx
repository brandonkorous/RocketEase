"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar, NavbarStart, NavbarCenter, NavbarEnd, Button } from "@wizeworks/silicaui-react";
import { Mark, MenuIcon, CloseIcon } from "@rocketease/ui/icons";
import { Wordmark } from "@rocketease/ui/brand";
import { AUTH_LINKS } from "@/lib/nav";
import { PrimaryNav } from "./nav-menu";
import { MobileNav } from "./mobile-nav";

export function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-base-300 bg-base-100/95 backdrop-blur-sm">
      <Navbar className="page-container min-h-18">
        <NavbarStart>
          <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight" aria-label="RocketEase home">
            <Mark size={30} />
            <Wordmark className="text-lg" />
          </Link>
        </NavbarStart>

        <NavbarCenter className="hidden lg:flex">
          <PrimaryNav />
        </NavbarCenter>

        <NavbarEnd className="gap-2">
          <Button variant="ghost" color="neutral" className="hidden h-11 sm:inline-block" render={<Link href={AUTH_LINKS.login} />}>
            Log in
          </Button>
          <Button color="primary" className="hidden h-11 sm:inline-block" render={<Link href={AUTH_LINKS.signup} />}>
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

      {open && <MobileNav onNavigate={() => setOpen(false)} />}
    </header>
  );
}
