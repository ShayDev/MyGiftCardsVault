import React from "react";
import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import LanguageProvider from "../components/LanguageProvider";
import GlobalSearchHeader from "../components/GlobalSearchHeader";
import BottomNav from "../components/BottomNav";
import VisitTracker from "../components/VisitTracker";

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
    <html lang="en" dir="ltr">
      <head>
        <meta name="theme-color" content="#0f172a" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="app-root min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col">
        <LanguageProvider>
          <header className="app-header bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
            <div className="header-inner max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
              <GlobalSearchHeader />
            </div>
          </header>
          <main className="app-main max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 flex-1 flex flex-col pb-20">{children}</main>
          <BottomNav />
          <VisitTracker />
        </LanguageProvider>
      </body>
    </html>
    </ClerkProvider>
  );
}
