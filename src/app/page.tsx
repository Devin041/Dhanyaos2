import PageClient from './page-client'

// Force static rendering — no SSR on every request
// This prevents OOM in memory-constrained environments (4GB sandbox)
// All interactivity is handled client-side via React hydration
export const dynamic = 'force-static'

export default function Page() {
  return <PageClient />
}
