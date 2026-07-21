// Browser-safe ("public") runtime configuration.
//
// NEXT_PUBLIC_* values are normally inlined into the client bundle at BUILD
// time, so they must be present as build args when the production image is
// built. When they are not, the browser bundle ships with them undefined, the
// client Supabase client becomes null, and every client-side auth/watchlist
// call silently no-ops — this is what blocked all sign-ups at launch (see
// docs/signup.md).
//
// As a second, independent layer of defense the root layout injects these same
// values into the initial HTML from the server's *runtime* env (which is
// always present), and this resolver falls back to them when the build-time
// value is missing. The build-time value always wins, so a correctly built
// bundle behaves exactly as before; the fallback only engages in the broken
// build-arg case.
//
// Only genuinely public values belong here — the Supabase project URL, the
// anon key (RLS-protected and designed to ship to browsers), and the app URL.
// Never inject the service-role key or any other secret.

export const PUBLIC_ENV_GLOBAL = '__RU_PUBLIC_ENV__'

export interface PublicEnv {
  NEXT_PUBLIC_SUPABASE_URL?: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string
  NEXT_PUBLIC_APP_URL?: string
}

// The values Next.js inlines into this bundle at build time on the client, or
// reads from the live process environment on the server. Referenced statically
// so the Next.js compiler can substitute them into the browser bundle.
export function readPublicEnvFromProcess(): PublicEnv {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  }
}

// Values the server injected into the page for the browser to read. Empty on
// the server and whenever nothing was injected.
function injectedPublicEnv(): PublicEnv {
  if (typeof window === 'undefined') return {}
  const value = (window as unknown as Record<string, unknown>)[PUBLIC_ENV_GLOBAL]
  return value && typeof value === 'object' ? (value as PublicEnv) : {}
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

// Resolve public config: the build-time value wins (identical behavior to a
// correctly built bundle); otherwise fall back to the runtime value injected
// into the page. `injected` is overridable to keep the function testable.
export function resolvePublicEnv(injected: PublicEnv = injectedPublicEnv()): PublicEnv {
  const build = readPublicEnvFromProcess()
  return {
    NEXT_PUBLIC_SUPABASE_URL: firstNonEmpty(
      build.NEXT_PUBLIC_SUPABASE_URL,
      injected.NEXT_PUBLIC_SUPABASE_URL,
    ),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: firstNonEmpty(
      build.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      injected.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    NEXT_PUBLIC_APP_URL: firstNonEmpty(
      build.NEXT_PUBLIC_APP_URL,
      injected.NEXT_PUBLIC_APP_URL,
    ),
  }
}

// Serialize the server's runtime public env into a <script> body that assigns
// window[PUBLIC_ENV_GLOBAL]. Empty values are dropped, and "<" is escaped so
// the payload can never close the surrounding <script> tag or inject markup.
export function serializePublicEnvScript(env: PublicEnv): string {
  const clean: PublicEnv = {}
  if (env.NEXT_PUBLIC_SUPABASE_URL) clean.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
  if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY) clean.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (env.NEXT_PUBLIC_APP_URL) clean.NEXT_PUBLIC_APP_URL = env.NEXT_PUBLIC_APP_URL

  const json = JSON.stringify(clean).replace(/</g, '\\u003c')
  const key = JSON.stringify(PUBLIC_ENV_GLOBAL)
  return `window[${key}]=Object.assign(window[${key}]||{},${json});`
}
