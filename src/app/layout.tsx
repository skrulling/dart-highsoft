import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Home, Gamepad2, BarChart3 } from "lucide-react";
import { Analytics } from '@vercel/analytics/react';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dart Highsoft - Dart Scoring App",
  description: "A modern, real-time dart scoring application for competitive matches and practice sessions",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" }
    ],
    apple: { url: "/apple-icon.png", sizes: "180x180", type: "image/png" }
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Dart Highsoft"
  },
  formatDetection: {
    telephone: false
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen h-full bg-background text-foreground`}
      >
        <div className="min-h-screen pb-16 md:pb-0">
          <nav className="hidden md:flex items-center justify-between px-6 py-3 border-b bg-card">
            <div className="font-semibold">Dart Scoreboard</div>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/" className="flex items-center gap-2">
                <Home className="size-4" />
                Home
              </Link>
              <Link href="/games" className="flex items-center gap-2">
                <Gamepad2 className="size-4" />
                Games
              </Link>
              <Link href="/stats" className="flex items-center gap-2">
                <BarChart3 className="size-4" />
                Statistics
              </Link>
            </div>
          </nav>
          <main className="px-3 py-2 md:p-6 max-w-6xl mx-auto">{children}</main>
          <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t bg-card">
            <div className="grid grid-cols-3">
              <Link href="/" className="flex flex-col items-center justify-center py-2 gap-1">
                <Home className="size-5" />
                <span className="text-xs">Home</span>
              </Link>
              <Link href="/games" className="flex flex-col items-center justify-center py-2 gap-1">
                <Gamepad2 className="size-5" />
                <span className="text-xs">Games</span>
              </Link>
              <Link href="/stats" className="flex flex-col items-center justify-center py-2 gap-1">
                <BarChart3 className="size-5" />
                <span className="text-xs">Stats</span>
              </Link>
            </div>
          </nav>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
