import { readPublicEnvFromProcess, serializePublicEnvScript } from '@/lib/public-env'

// Serves the browser-safe public config as JavaScript that assigns
// window.__RU_PUBLIC_ENV__. This runs at request time (never prerendered), so
// it always reflects the server's *runtime* env — the browser then works even
// when the image was built without NEXT_PUBLIC_* build args and static pages
// baked those values empty. Loaded via a beforeInteractive <Script> in the
// root layout. Only public values are emitted (see lib/public-env.ts).
export const dynamic = 'force-dynamic'

export function GET() {
  const body = serializePublicEnvScript(readPublicEnvFromProcess())
  return new Response(body, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      // Config changes only on redeploy; never serve a stale bundle's values.
      'Cache-Control': 'no-store',
    },
  })
}
