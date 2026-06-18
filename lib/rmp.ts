const RMP_GRAPHQL_URL = 'https://www.ratemyprofessors.com/graphql'
const RMP_AUTH = 'Basic dGVzdDp0ZXN0'
const RUTGERS_SCHOOL_ID = 'U2Nob29sLTgyNQ=='

async function rmpFetch(query: string, variables: Record<string, unknown>) {
  const res = await fetch(RMP_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: RMP_AUTH,
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`RMP API error: ${res.status}`)
  return res.json()
}

export async function searchProfessors(name: string, schoolId = RUTGERS_SCHOOL_ID) {
  const query = `
    query SearchProfessors($text: String!, $schoolID: ID) {
      newSearch {
        teachers(query: { text: $text, schoolID: $schoolID }, first: 20) {
          edges {
            node {
              id
              firstName
              lastName
              department
              school {
                name
                city
                state
              }
              avgRating
              avgDifficulty
              wouldTakeAgainPercent
              numRatings
            }
          }
        }
      }
    }
  `
  const data = await rmpFetch(query, { text: name, schoolID: schoolId })
  return data?.data?.newSearch?.teachers?.edges?.map((e: { node: unknown }) => e.node) ?? []
}

export async function getProfessorById(id: string) {
  const query = `
    query GetProfessor($id: ID!, $cursor: String) {
      node(id: $id) {
        ... on Teacher {
          id
          firstName
          lastName
          department
          school {
            name
            city
            state
          }
          avgRating
          avgDifficulty
          wouldTakeAgainPercent
          numRatings
          ratings(first: 100, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                id
                comment
                qualityRating
                difficultyRatingRounded
                thumbsUpTotal
                thumbsDownTotal
                date
                grade
                isForOnlineClass
                attendanceMandatory
                wouldTakeAgain
                ratingTags
              }
            }
          }
        }
      }
    }
  `
  // Fetch first page
  const data = await rmpFetch(query, { id, cursor: null })
  const teacher = data?.data?.node
  if (!teacher) return null

  function parseEdges(edges: { node: RMPRatingNode }[]) {
    return edges.map(e => ({
      id: e.node.id,
      comment: e.node.comment,
      qualityRating: e.node.qualityRating,
      difficultyRatingRounded: e.node.difficultyRatingRounded,
      thumbsUpTotal: e.node.thumbsUpTotal,
      thumbsDownTotal: e.node.thumbsDownTotal,
      date: e.node.date,
      grade: e.node.grade,
      isForOnlineClass: e.node.isForOnlineClass,
      attendanceMandatory: e.node.attendanceMandatory,
      wouldTakeAgain: e.node.wouldTakeAgain,
      tags: e.node.ratingTags ? e.node.ratingTags.split('--') : [],
    }))
  }

  const ratings = parseEdges(teacher.ratings?.edges ?? [])

  // Fetch one additional page if there are more reviews (up to 200 total)
  const pageInfo = teacher.ratings?.pageInfo
  if (pageInfo?.hasNextPage && pageInfo.endCursor && ratings.length < 200) {
    try {
      const page2 = await rmpFetch(query, { id, cursor: pageInfo.endCursor })
      const page2Edges = page2?.data?.node?.ratings?.edges ?? []
      ratings.push(...parseEdges(page2Edges))
    } catch {
      // Non-fatal: keep first page results
    }
  }

  return {
    id: teacher.id,
    firstName: teacher.firstName,
    lastName: teacher.lastName,
    department: teacher.department,
    schoolName: teacher.school?.name ?? 'Rutgers University',
    avgRating: teacher.avgRating,
    avgDifficulty: teacher.avgDifficulty,
    wouldTakeAgainPercent: teacher.wouldTakeAgainPercent,
    numRatings: teacher.numRatings,
    ratings,
  }
}

interface RMPRatingNode {
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
  ratingTags: string
}

export function makeSlug(firstName: string, lastName: string, rmpId: string) {
  const base = `${firstName}-${lastName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const shortId = rmpId.replace(/[^a-zA-Z0-9]/g, '').slice(-6)
  return `${base}-${shortId}`
}
