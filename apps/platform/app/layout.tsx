import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/app-providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "RocketEase", template: "%s · RocketEase" },
  description: "Effortless Launch. Better by Design.",
  icons: { icon: "/icon.png" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="rke" className={inter.variable}>
      <body className="min-h-dvh bg-base-100 text-base-content antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
