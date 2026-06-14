export interface RMPSchool {
  id?: string | null
  name?: string | null
  city?: string | null
  state?: string | null
  numRatings?: number | null
}

export interface RMPProfessorSearchResult {
  id: string
  legacyId?: number | string | null
  firstName: string
  lastName: string
  department: string | null
  school: RMPSchool | null
  avgRating: number | null
  avgDifficulty: number | null
  numRatings: number | null
  wouldTakeAgainPercent: number | null
}

export interface RMPRating {
  id: string
  date: string | null
  class: string | null
  comment: string | null
  ratingTags: string | null
  clarityRating: number | null
  helpfulRating: number | null
  difficultyRating: number | null
  wouldTakeAgain: boolean | number | string | null
  grade: string | null
  isForCredit: boolean | null
  isForOnlineClass: boolean | null
  attendanceMandatory: string | null
  textbookUse: number | string | null
  thumbsUpTotal: number | null
  thumbsDownTotal: number | null
}

export interface RMPProfessorProfile {
  id: string
  firstName: string
  lastName: string
  department: string | null
  avgRating: number | null
  avgDifficulty: number | null
  numRatings: number | null
  wouldTakeAgainPercent: number | null
  school: RMPSchool | null
}

export interface RMPRatingsResult {
  ratings: RMPRating[]
  profile: RMPProfessorProfile | null
}

export interface LocalProfessorCandidateInput {
  id?: string | null
  firstName?: string | null
  lastName?: string | null
  name?: string | null
  department?: string | null
}

export type CandidateMatchLevel = 'exact_name' | 'strong_candidate' | 'possible_candidate' | 'weak_candidate'

export interface RMPProfessorCandidate {
  professor: RMPProfessorSearchResult
  score: number
  matchLevel: CandidateMatchLevel
  reasons: string[]
  recommendedAction: 'review_exact_match' | 'manual_review'
}
