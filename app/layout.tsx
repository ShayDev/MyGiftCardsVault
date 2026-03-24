import React from "react";
import type { Metadata } from "next";
import "./globals.css";
import LanguageProvider from "../components/LanguageProvider";
import LanguageToggle from "../components/LanguageToggle";

export const metadata: Metadata = {
  title: "MyGiftCardsVault",
  description: "Family gift card management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr">
      <head />
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <LanguageProvider>
          <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl flex items-center justify-center shadow-sm">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                    />
                  </svg>
                </div>
                <div>
                  <span className="font-bold text-slate-900 tracking-tight">
                    GiftCards
                  </span>
                  <span className="font-bold text-emerald-600 tracking-tight">
                    Vault
                  </span>
                </div>
              </div>
              <LanguageToggle />
            </div>
          </header>
          <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">{children}</main>
        </LanguageProvider>
      </body>
    </html>
  );
}
