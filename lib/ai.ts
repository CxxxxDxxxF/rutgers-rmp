import type { Rating, AIAnalysis } from './supabase'

export async function analyzeProfessor(
  name: string,
  department: string,
  avgRating: number,
  avgDifficulty: number,
  wouldTakeAgainPercent: number,
  ratings: Rating[]
): Promise<AIAnalysis> {
  const recentReviews = ratings
    .filter((r) => r.comment && r.comment.length > 20)
    .slice(0, 40)
    .map((r) => `[${r.qualityRating}/5, Diff: ${r.difficultyRatingRounded}/5, Grade: ${r.grade || 'N/A'}]: ${r.comment}`)
    .join('\n')

  const prompt = `You are analyzing a Rutgers University professor for a student-facing Rate My Professor tool.

Professor: ${name}
Department: ${department}
Average Rating: ${avgRating}/5
Average Difficulty: ${avgDifficulty}/5
Would Take Again: ${wouldTakeAgainPercent?.toFixed(0) ?? 'N/A'}%
Total Ratings: ${ratings.length}

Recent student reviews:
${recentReviews}

Rutgers students care most about: grading leniency, attendance policies, exam difficulty, workload per week, whether the textbook is required, and how much the professor affects final grade vs curved exams.

Return a JSON object with these exact fields:
{
  "verdict": "take" | "avoid" | "depends",
  "verdict_reason": "One punchy sentence explaining the verdict (max 20 words)",
  "teaching_style": "2-3 sentences describing how this prof teaches",
  "workload": "2-3 sentences on workload, homework, assignments",
  "grading": "2-3 sentences on grading style, curves, exams",
  "tips": ["tip1", "tip2", "tip3", "tip4"],
  "best_for": "One sentence: what type of student thrives with this prof",
  "worst_for": "One sentence: what type of student struggles",
  "common_complaints": ["complaint1", "complaint2", "complaint3"],
  "common_praise": ["praise1", "praise2", "praise3"]
}

Be direct and honest. Rutgers students want real talk, not sugarcoating. Use student-friendly language.`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://rurate.vercel.app',
      'X-Title': 'RU Rate',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) throw new Error(`OpenRouter error: ${res.status} ${await res.text()}`)

  const data = await res.json()
  const text: string = data.choices[0].message.content ?? ''

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in AI response')

  return JSON.parse(jsonMatch[0]) as AIAnalysis
}
