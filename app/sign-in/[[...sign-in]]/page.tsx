'use client'

import dynamic from 'next/dynamic'

// Clerk's <SignIn /> mounts its own host div client-side, and its SSR
// placeholder doesn't reliably match that mount — causes a hydration error
// on this specific @clerk/nextjs@7 + Next.js 16 combo. Rendering it client-only
// sidesteps the mismatch entirely (nothing to diff against on hydration).
const SignIn = dynamic(() => import('@clerk/nextjs').then((m) => m.SignIn), { ssr: false })

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <SignIn />
    </div>
  )
}
