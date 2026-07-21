import { createClient } from '@supabase/supabase-js'
import { resolvePublicEnv } from './public-env'

// Build-time inlined NEXT_PUBLIC_* first; if the browser bundle was built
// without those build args, fall back to the runtime config the root layout
// injects into the page (see lib/public-env.ts / docs/signup.md).
const { NEXT_PUBLIC_SUPABASE_URL: supabaseUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey } =
  resolvePublicEnv()

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null

export interface ProfessorCache {
  id: string
  rmp_id: string
  slug: string
  first_name: string
  last_name: string
  department: string
  school_name: string
  avg_rating: number
  avg_difficulty: number
  would_take_again: number
  num_ratings: number
  ratings: Rating[]
  ai_analysis: AIAnalysis | null
  cached_at: string
  search_count: number
  tag_counts?: Record<string, number> | null
}

export interface Rating {
  id: string
  class?: string | null
  comment: string
  qualityRating: number
  difficultyRatingRounded: number
  thumbsUpTotal: number
  thumbsDownTotal: number
  date: string
  grade: string
  isForOnlineClass: boolean
  attendanceMandatory: string
  wouldTakeAgain: boolean
  tags: string[]
}

export interface AIAnalysis {
  verdict: 'take' | 'avoid' | 'depends'
  verdict_reason: string
  teaching_style: string
  workload: string
  grading: string
  tips: string[]
  best_for: string
  worst_for: string
  common_complaints: string[]
  common_praise: string[]
}
