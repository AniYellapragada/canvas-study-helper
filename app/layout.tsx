import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Canvas Study Helper",
  description: "AI study helper grounded in your Canvas courses",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <nav className="border-b border-white/10 px-6 py-3 flex items-center gap-6">
          <Link href="/" className="font-semibold">
            Canvas Study Helper
          </Link>
          <Link href="/" className="text-sm text-white/70 hover:text-white">
            Dashboard
          </Link>
          <Link href="/connect" className="text-sm text-white/70 hover:text-white">
            Connect Canvas
          </Link>
          <Link href="/schedule" className="text-sm text-white/70 hover:text-white">
            Schedule
          </Link>
          <Link href="/chat" className="text-sm text-white/70 hover:text-white">
            Chat
          </Link>
        </nav>
        <main className="p-6">{children}</main>
      </body>
    </html>
  );
}
