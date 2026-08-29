import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "RocketEase — Effortless Launch. Better by Design.",
  description:
    "Plan, publish, engage, and grow across every platform from one powerful, easy-to-use social marketing platform.",
  metadataBase: new URL("https://rocketease.com"),
  icons: { icon: "/icon.png" },
  openGraph: {
    title: "RocketEase — Effortless Launch. Better by Design.",
    description:
      "Plan, publish, engage, and grow across every platform from one social marketing platform.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="rke" className={inter.variable}>
      <body className="min-h-dvh bg-base-100 text-base-content antialiased">{children}</body>
    </html>
  );
}
