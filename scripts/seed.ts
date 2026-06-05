/**
 * Seeds the Supabase professor_cache with popular Rutgers NB professors.
 * Requires the Next.js dev server running at localhost:3000.
 *
 * Usage: npm run seed
 */

const RMP_GRAPHQL_URL = 'https://www.ratemyprofessors.com/graphql'
const RMP_AUTH = 'Basic dGVzdDp0ZXN0'
const RUTGERS_SCHOOL_ID = 'U2Nob29sLTgyNQ=='
const ANALYZE_URL = 'http://localhost:3000/api/analyze'

// Name validation: skip result if last names don't match
function isNameMatch(searched: string, found: { firstName: string; lastName: string }): boolean {
  const searchedLast = searched.trim().split(/\s+/).pop()?.toLowerCase() ?? ''
  const foundLast = found.lastName.toLowerCase()
  return foundLast.includes(searchedLast) || searchedLast.includes(foundLast)
}

const PROFESSORS: { name: string; department: string }[] = [
  // ── Computer Science ────────────────────────────────────────────
  { name: 'Ivan Marsic',           department: 'Computer Science' },
  { name: 'Rich Martin',           department: 'Computer Science' },
  { name: 'Badri Nath',            department: 'Computer Science' },
  { name: 'Vinod Ganapathy',       department: 'Computer Science' },
  { name: 'David Cash',            department: 'Computer Science' },
  { name: 'Matthew Stone',         department: 'Computer Science' },
  { name: 'Kostas Bekris',         department: 'Computer Science' },
  { name: 'Manish Parashar',       department: 'Computer Science' },
  { name: 'Dimitris Metaxas',      department: 'Computer Science' },
  { name: 'Thu Nguyen',            department: 'Computer Science' },
  { name: 'Santosh Nagarakatte',   department: 'Computer Science' },
  { name: 'Yongfeng Zhang',        department: 'Computer Science' },

  // ── Mathematics ─────────────────────────────────────────────────
  { name: 'Eugene Speer',          department: 'Mathematics' },
  { name: 'Vladimir Retakh',       department: 'Mathematics' },
  { name: 'Lisa Carbone',          department: 'Mathematics' },
  { name: 'Simon Thomas',          department: 'Mathematics' },
  { name: 'Shubhangi Saraf',       department: 'Mathematics' },
  { name: 'Alex Kontorovich',      department: 'Mathematics' },
  { name: 'Chris Woodward',        department: 'Mathematics' },
  { name: 'Michael Saks',          department: 'Mathematics' },

  // ── Physics & Astronomy ──────────────────────────────────────────
  { name: 'Kristjan Haule',        department: 'Physics' },
  { name: 'Emil Yuzbashyan',       department: 'Physics' },
  { name: 'Girsh Blumberg',        department: 'Physics' },
  { name: 'Matthew Buckley',       department: 'Physics' },
  { name: 'Ronald Gilman',         department: 'Physics' },
  { name: 'Eric Gawiser',          department: 'Physics' },
  { name: 'Torgny Gustafsson',     department: 'Physics' },

  // ── Chemistry & Chemical Biology ────────────────────────────────
  { name: 'Alan Goldman',          department: 'Chemistry' },
  { name: 'Gene Hall',             department: 'Chemistry' },
  { name: 'Wilma Olson',           department: 'Chemistry' },
  { name: 'Joachim Kohn',          department: 'Chemistry' },
  { name: 'John Brennan',          department: 'Chemistry' },
  { name: 'Spencer Knapp',         department: 'Chemistry' },

  // ── Biological Sciences ──────────────────────────────────────────
  { name: 'Jim White',             department: 'Plant Biology' },
  { name: 'Judith Grassle',        department: 'Marine Sciences' },
  { name: 'Kenneth Irvine',        department: 'Genetics' },
  { name: 'Monica Driscoll',       department: 'Genetics' },
  { name: 'Joachim Messing',       department: 'Genetics' },

  // ── Psychology ──────────────────────────────────────────────────
  { name: 'Maurice Elias',         department: 'Psychology' },
  { name: 'Lee Jussim',            department: 'Psychology' },
  { name: 'Gretchen Chapman',      department: 'Psychology' },
  { name: 'Arnold Glass',          department: 'Psychology' },
  { name: 'Alan Rodrigues',        department: 'Psychology' },
  { name: 'Kent Harber',           department: 'Psychology' },

  // ── Economics ───────────────────────────────────────────────────
  { name: 'Michael Bordo',         department: 'Economics' },
  { name: 'Eugene White',          department: 'Economics' },
  { name: 'Ira Gang',              department: 'Economics' },
  { name: 'Hugh Rockoff',          department: 'Economics' },
  { name: 'Todd Keister',          department: 'Economics' },
  { name: 'Mark Killingsworth',    department: 'Economics' },

  // ── Political Science ────────────────────────────────────────────
  { name: 'Beth Leech',            department: 'Political Science' },
  { name: 'Rick Lau',              department: 'Political Science' },
  { name: 'Cynthia Daniels',       department: 'Political Science' },
  { name: 'Ross Baker',            department: 'Political Science' },

  // ── History ─────────────────────────────────────────────────────
  { name: 'Paul Clemens',          department: 'History' },
  { name: 'James Livingston',      department: 'History' },
  { name: 'Jackson Lears',         department: 'History' },
  { name: 'Temma Kaplan',          department: 'History' },
  { name: 'John Gillis',           department: 'History' },
  { name: 'David Oshinsky',        department: 'History' },

  // ── English ─────────────────────────────────────────────────────
  { name: 'Elin Diamond',          department: 'English' },
  { name: 'Michael McKeon',        department: 'English' },
  { name: 'Rebecca Walkowitz',     department: 'English' },
  { name: 'Ann Jurecic',           department: 'English' },
  { name: 'Jonathan Kramnick',     department: 'English' },

  // ── Sociology ───────────────────────────────────────────────────
  { name: 'Patricia Roos',         department: 'Sociology' },
  { name: 'Joanna Kempner',        department: 'Sociology' },
  { name: 'Karen Cerulo',          department: 'Sociology' },
  { name: 'Barbara Zsembik',       department: 'Sociology' },

  // ── Philosophy ──────────────────────────────────────────────────
  { name: 'Peter Klein',           department: 'Philosophy' },
  { name: 'Brian McLaughlin',      department: 'Philosophy' },
  { name: 'Larry Temkin',          department: 'Philosophy' },
  { name: 'Dean Zimmerman',        department: 'Philosophy' },

  // ── Electrical & Computer Engineering ───────────────────────────
  { name: 'Wade Trappe',           department: 'Electrical Engineering' },
  { name: 'Predrag Spasojevic',    department: 'Electrical Engineering' },
  { name: 'Narayan Mandayam',      department: 'Electrical Engineering' },
  { name: 'Yingying Chen',         department: 'Electrical Engineering' },
  { name: 'Anand Sarwate',         department: 'Electrical Engineering' },

  // ── Mechanical & Aerospace Engineering ──────────────────────────
  { name: 'Alberto Cuitino',       department: 'Mechanical Engineering' },
  { name: 'Tobias Rossman',        department: 'Mechanical Engineering' },
  { name: 'Howon Lee',             department: 'Mechanical Engineering' },

  // ── Civil & Environmental Engineering ───────────────────────────
  { name: 'Kaan Ozbay',            department: 'Civil Engineering' },
  { name: 'Hao Wang',              department: 'Civil Engineering' },
  { name: 'Lisa Axe',              department: 'Civil Engineering' },

  // ── Chemical & Biochemical Engineering ──────────────────────────
  { name: 'Charles Roth',          department: 'Chemical Engineering' },
  { name: 'Jerry Shan',            department: 'Chemical Engineering' },
  { name: 'Marianthi Ierapetritou', department: 'Chemical Engineering' },

  // ── Biomedical Engineering ───────────────────────────────────────
  { name: 'David Shreiber',        department: 'Biomedical Engineering' },
  { name: 'Martin Yarmush',        department: 'Biomedical Engineering' },

  // ── Business (Rutgers Business School) ──────────────────────────
  { name: 'Farrokh Langdana',      department: 'Finance & Economics' },
  { name: 'Simi Kedia',            department: 'Finance' },
  { name: 'Glenn Shafer',          department: 'Accounting' },
  { name: 'Barry Sopher',          department: 'Economics' },
  { name: 'Howard Tuckman',        department: 'Economics' },
  { name: 'Barry Farber',          department: 'Marketing' },

  // ── Education (GSE) ─────────────────────────────────────────────
  { name: 'Bruce Baker',           department: 'Education' },
  { name: 'James Giarelli',        department: 'Education' },

  // ── Communication ───────────────────────────────────────────────
  { name: 'Todd Gitlin',           department: 'Communication' },

  // ── Journalism & Media Studies ──────────────────────────────────
  { name: 'Jack Bratich',          department: 'Journalism & Media Studies' },
  { name: 'David Corcoran',        department: 'Journalism & Media Studies' },

  // ── Food Science ────────────────────────────────────────────────
  { name: 'Kit Yam',               department: 'Food Science' },
  { name: 'Paul Breslin',          department: 'Food Science' },
  { name: 'Donald Schaffner',      department: 'Food Science' },

  // ── Statistics ──────────────────────────────────────────────────
  { name: 'Cun-Hui Zhang',         department: 'Statistics' },
  { name: 'Regina Liu',            department: 'Statistics' },
  { name: 'John Kolassa',          department: 'Statistics' },

  // ── Linguistics ─────────────────────────────────────────────────
  { name: 'Alan Prince',           department: 'Linguistics' },
  { name: 'Bruce Tesar',           department: 'Linguistics' },
  { name: 'Mark Baker',            department: 'Linguistics' },

  // ── Criminal Justice ─────────────────────────────────────────────
  { name: 'Todd Clear',            department: 'Criminal Justice' },
  { name: 'Leslie Kennedy',        department: 'Criminal Justice' },
  { name: 'Ronald Clarke',         department: 'Criminal Justice' },

  // ── Art History ──────────────────────────────────────────────────
  { name: 'Catherine Puglisi',     department: 'Art History' },

  // ── Music ────────────────────────────────────────────────────────
  { name: 'Eric Moe',              department: 'Music' },
  { name: 'Andrew Pau',            department: 'Music' },

  // ── Theater ──────────────────────────────────────────────────────
  { name: 'Mary Fleischer',        department: 'Theater' },

  // ── Social Work ──────────────────────────────────────────────────
  { name: 'Stanley Witkin',        department: 'Social Work' },
]

async function searchProfessors(name: string): Promise<{ id: string; firstName: string; lastName: string }[]> {
  const query = `
    query SearchProfessors($text: String!, $schoolID: ID) {
      newSearch {
        teachers(query: { text: $text, schoolID: $schoolID }, first: 5) {
          edges {
            node {
              id
              firstName
              lastName
              department
            }
          }
        }
      }
    }
  `
  const res = await fetch(RMP_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: RMP_AUTH },
    body: JSON.stringify({ query, variables: { text: name, schoolID: RUTGERS_SCHOOL_ID } }),
  })
  if (!res.ok) throw new Error(`RMP API error: ${res.status}`)
  const data = await res.json()
  return data?.data?.newSearch?.teachers?.edges?.map((e: { node: unknown }) => e.node) ?? []
}

async function analyzeAndCache(rmpId: string): Promise<void> {
  const res = await fetch(ANALYZE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rmpId }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Analyze API error ${res.status}: ${text}`)
  }
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  console.log(`Seeding ${PROFESSORS.length} professors across all departments...\n`)
  let seeded = 0
  let skipped = 0
  let wrongMatch = 0

  for (const prof of PROFESSORS) {
    process.stdout.write(`[${seeded + skipped + wrongMatch + 1}/${PROFESSORS.length}] ${prof.name} (${prof.department})... `)
    try {
      const results = await searchProfessors(prof.name)
      if (!results.length) {
        console.log('not on RMP, skipping')
        skipped++
        continue
      }

      // Find first result whose last name matches
      const match = results.find(r => isNameMatch(prof.name, r))
      if (!match) {
        console.log(`no name match (got: ${results[0].firstName} ${results[0].lastName}), skipping`)
        wrongMatch++
        continue
      }

      console.log(`→ ${match.firstName} ${match.lastName} (${match.id})`)
      process.stdout.write('  Analyzing... ')
      await analyzeAndCache(match.id)
      console.log('cached ✓')
      seeded++

      await sleep(1500)
    } catch (err) {
      console.log(`ERROR: ${err instanceof Error ? err.message : err}`)
      skipped++
    }
  }

  console.log(`\n✓ Done. Cached: ${seeded} | Wrong match skipped: ${wrongMatch} | Not found: ${skipped}`)
  console.log(`  Total in database: ${seeded} new (plus any previously cached)`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
