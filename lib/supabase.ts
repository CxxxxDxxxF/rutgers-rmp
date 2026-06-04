import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

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
  ai_analysis: AIAnalysis
  cached_at: string
  search_count: number
}

export interface Rating {
  id: string
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
