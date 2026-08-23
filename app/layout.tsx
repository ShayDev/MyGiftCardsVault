import React from "react";
import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider, ClerkLoaded } from "@clerk/nextjs";
import LanguageProvider from "../components/LanguageProvider";
import ThemeProvider from "../components/ThemeProvider";
import GlobalSearchHeader from "../components/GlobalSearchHeader";
import BottomNav from "../components/BottomNav";
import VisitTracker from "../components/VisitTracker";
import InstallPromptListener from "../components/InstallPromptListener";

export const metadata: Metadata = {
  title: "MyGiftCardsVault",
  description: "Family gift card management",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.svg",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GiftVault",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0f172a" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        {/* Blocking, runs before first paint — avoids a flash of the wrong theme
            while ThemeProvider's useEffect (which can't run this early) hydrates. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try {
              var t = JSON.parse(localStorage.getItem('gcv-theme') || '{}').state?.theme || 'system';
              var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
              document.documentElement.classList.toggle('dark', dark);
            } catch (e) {}`,
          }}
        />
      </head>
      <body className="app-root min-h-screen bg-slate-50 dark:bg-neutral-950 text-slate-900 dark:text-neutral-400 antialiased flex flex-col">
        <ThemeProvider>
        <LanguageProvider>
          <header className="app-header bg-white dark:bg-neutral-900 border-b border-slate-200 dark:border-neutral-700 sticky top-0 z-10 shadow-sm">
            <div className="header-inner max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
              <GlobalSearchHeader />
            </div>
          </header>
          <main className="app-main max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 flex-1 flex flex-col pb-20">{children}</main>
          {/* Defers mounting until Clerk's auth state is definitively known — BottomNav
              is entirely auth-gated (returns null when signed out), so there's no
              signed-out flash either way, but this is the idiomatic Clerk pattern
              rather than relying on isSignedIn being falsy-while-undefined. */}
          <ClerkLoaded>
            <BottomNav />
          </ClerkLoaded>
          <VisitTracker />
          <InstallPromptListener />
        </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
    </ClerkProvider>
  );
}
