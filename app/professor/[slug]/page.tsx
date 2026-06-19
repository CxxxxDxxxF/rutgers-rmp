import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import ProfessorPageClient from './PageClient'

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params

  if (!supabase) return { title: 'Professor | RU Rate' }

  const { data } = await supabase
    .from('professor_cache')
    .select('first_name, last_name, department, avg_rating, num_ratings')
    .eq('slug', slug)
    .single()

  if (!data) {
    const { data: prof } = await supabase
      .from('professors')
      .select('first_name, last_name')
      .eq('slug', slug)
      .single()

    if (prof) {
      const name = `${prof.first_name} ${prof.last_name}`
      return {
        title: `${name} | RU Rate`,
        description: `Read reviews and ratings for ${name} at Rutgers University on RU Rate.`,
      }
    }
    return { title: 'Professor | RU Rate' }
  }

  const name = `${data.first_name} ${data.last_name}`
  const rating = data.avg_rating ? `${Number(data.avg_rating).toFixed(1)}/5` : 'No RMP rating'
  const dept = data.department ?? 'Rutgers University'
  const reviews = data.num_ratings ? `${data.num_ratings} student reviews` : 'No reviews yet'
  const description = `${name} — ${dept} at Rutgers. ${rating} · ${reviews}. Read AI analysis, student tips, and schedule on RU Rate.`

  return {
    title: `${name} | RU Rate`,
    description,
    openGraph: { title: `${name} | RU Rate`, description },
  }
}

export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <ProfessorPageClient params={params} />
}
