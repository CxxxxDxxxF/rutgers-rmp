import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import CoursePageClient from './PageClient'

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params

  if (!supabase) return { title: 'Course | RU Rate' }

  const { data } = await supabase
    .from('courses')
    .select('course_number, name, credits, description')
    .eq('slug', slug)
    .single()

  if (!data) return { title: 'Course | RU Rate' }

  const credits = data.credits ? ` · ${data.credits} credits` : ''
  const description = data.description
    ?? `${data.course_number} — ${data.name}${credits} at Rutgers University. View sections, professors, and ratings on RU Rate.`

  return {
    title: `${data.course_number} ${data.name} | RU Rate`,
    description,
    openGraph: {
      title: `${data.course_number} ${data.name} | RU Rate`,
      description,
    },
  }
}

export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <CoursePageClient params={params} />
}
