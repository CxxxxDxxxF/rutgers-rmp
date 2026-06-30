import type { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'
import { SITE_URL } from '@/lib/seo'

const BASE_URL = SITE_URL
const COURSE_SITEMAP_LIMIT = 1000

const STATIC_ROUTES: MetadataRoute.Sitemap = [
  { url: BASE_URL,                       lastModified: new Date(), changeFrequency: 'daily',   priority: 1 },
  { url: `${BASE_URL}/courses`,          lastModified: new Date(), changeFrequency: 'hourly',  priority: 0.9 },
  { url: `${BASE_URL}/departments`,      lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.8 },
  { url: `${BASE_URL}/professors`,       lastModified: new Date(), changeFrequency: 'daily',   priority: 0.85 },
  { url: `${BASE_URL}/reviews`,          lastModified: new Date(), changeFrequency: 'hourly',  priority: 0.75 },
  { url: `${BASE_URL}/compare`,          lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
  { url: `${BASE_URL}/schedule`,         lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
  { url: `${BASE_URL}/watchlist`,        lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  { url: `${BASE_URL}/pro`,              lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
]

export const dynamic = 'force-dynamic'
export const revalidate = 86400 // regenerate daily

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!supabase) return STATIC_ROUTES

  const [deptResult, profResult, courseResult] = await Promise.all([
    supabase
      .from('departments')
      .select('slug')
      .order('name'),

    supabase
      .from('professor_cache')
      .select('slug, cached_at')
      .not('ai_analysis', 'is', null)
      .order('num_ratings', { ascending: false })
      .limit(500),

    supabase
      .from('courses')
      .select('slug')
      .not('slug', 'is', null)
      .order('course_number', { ascending: true })
      .limit(COURSE_SITEMAP_LIMIT),
  ])

  const departmentUrls: MetadataRoute.Sitemap = (deptResult.data ?? [])
    .filter(d => d.slug)
    .map(d => ({
      url: `${BASE_URL}/department/${d.slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.65,
    }))

  const professorUrls: MetadataRoute.Sitemap = (profResult.data ?? [])
    .filter(p => p.slug)
    .map(p => ({
      url: `${BASE_URL}/professor/${p.slug}`,
      lastModified: p.cached_at ? new Date(p.cached_at) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))

  const courseUrls: MetadataRoute.Sitemap = (courseResult.data ?? [])
    .filter(c => c.slug)
    .map(c => ({
      url: `${BASE_URL}/course/${c.slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.72,
    }))

  return [...STATIC_ROUTES, ...departmentUrls, ...courseUrls, ...professorUrls]
}
