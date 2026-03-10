import React from 'react'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head />
      <body>
        <div className="min-h-screen bg-white text-slate-900">{children}</div>
      </body>
    </html>
  )
}
