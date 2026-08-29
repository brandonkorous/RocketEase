"use client";

import Link from "next/link";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuTrigger,
} from "@wizeworks/silicaui-react";
import { PRODUCT_LINKS, RESOURCE_LINKS, SOLUTION_LINKS, type NavColumn } from "@/lib/nav";

const MENUS: NavColumn[] = [
  { title: "Product", links: PRODUCT_LINKS },
  { title: "Solutions", links: SOLUTION_LINKS },
  { title: "Resources", links: RESOURCE_LINKS },
];

/** Desktop primary navigation: three dropdowns plus a direct Pricing link. */
export function PrimaryNav() {
  return (
    <NavigationMenu aria-label="Primary" className="border-0 bg-transparent p-0 shadow-none">
      {MENUS.map((menu) => (
        <NavigationMenuItem key={menu.title}>
          <NavigationMenuTrigger className="font-semibold">{menu.title}</NavigationMenuTrigger>
          <NavigationMenuContent className="min-w-56 p-2">
            <ul>
              {menu.links.map((l) => (
                <li key={l.href}>
                  <NavigationMenuLink
                    render={<Link href={l.href} />}
                    className="block rounded-field px-3 py-2 text-sm font-medium text-base-content no-underline hover:bg-base-200"
                  >
                    {l.label}
                  </NavigationMenuLink>
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      ))}
      <NavigationMenuItem>
        <NavigationMenuLink render={<Link href="/pricing" />} className="px-4 py-2 text-sm font-semibold text-base-content no-underline">
          Pricing
        </NavigationMenuLink>
      </NavigationMenuItem>
    </NavigationMenu>
  );
}
