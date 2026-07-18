#!/usr/bin/env -S npx tsx
/**
 * Refresh stale RateMyProfessors cache rows without requiring AI analysis.
 *
 * Dry-run is the default. Live writes require:
 *   npm run refresh:rmp-cache -- --apply --confirm-rmp-refresh-reviewed --limit 50
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { parseArgs } from 'util'
import { getProfessorById, makeSlug } from '../lib/rmp'

const DEFAULT_LIMIT = 25
const DEFAULT_DELAY_MS = 800
const DEFAULT_ROW_TIMEOUT_MS = 20_000
const CACHE_DAYS = 30

interface CacheRow {
  rmp_id: string
  first_name: string | null
  last_name: string | null
  cached_at: string | null
  ai_analysis: unknown | null
  search_count: number | null
}

interface RefreshResult {
  rmp_id: string
  name: string
  status: 'would_refresh' | 'refreshed' | 'error'
  cached_at?: string | null
  ratings?: number | null
  error?: string
}

const { values } = parseArgs({
  options: {
    apply: { type: 'boolean', default: false },
    'confirm-rmp-refresh-reviewed': { type: 'boolean', default: false },
    limit: { type: 'string', default: String(DEFAULT_LIMIT) },
    'delay-ms': { type: 'string', default: String(DEFAULT_DELAY_MS) },
    'row-timeout-ms': { type: 'string', default: String(DEFAULT_ROW_TIMEOUT_MS) },
    'older-than-days': { type: 'string', default: String(CACHE_DAYS) },
  },
})

const apply = values.apply === true
const limit = parsePositiveInt(values.limit ?? String(DEFAULT_LIMIT), 'limit')
const delayMs = parseNonNegativeInt(values['delay-ms'] ?? String(DEFAULT_DELAY_MS), 'delay-ms')
const rowTimeoutMs = parsePositiveInt(values['row-timeout-ms'] ?? String(DEFAULT_ROW_TIMEOUT_MS), 'row-timeout-ms')
const olderThanDays = parsePositiveInt(values['older-than-days'] ?? String(CACHE_DAYS), 'older-than-days')

if (apply && values['confirm-rmp-refresh-reviewed'] !== true) {
  fatal('Live writes require --confirm-rmp-refresh-reviewed after reviewing a dry run.')
}

loadEnvFile('.env.local')
loadEnvFile('.env')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  fatal('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
}

const db = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function main() {
  const mode = apply ? 'apply' : 'dry-run'
  console.log(`RMP cache refresh: mode=${mode} limit=${limit} olderThanDays=${olderThanDays} delayMs=${delayMs} rowTimeoutMs=${rowTimeoutMs}`)

  const rows = await fetchStaleRows()
  console.log(`Loaded ${rows.length} stale cache row${rows.length === 1 ? '' : 's'}`)

  const results: RefreshResult[] = []
  for (const row of rows) {
    const name = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || row.rmp_id

    try {
      if (!apply) {
        results.push({
          rmp_id: row.rmp_id,
          name,
          status: 'would_refresh',
          cached_at: row.cached_at,
        })
        continue
      }

      const professor = await withTimeout(
        getProfessorById(row.rmp_id),
        rowTimeoutMs,
        `Timed out fetching RMP record after ${rowTimeoutMs}ms`,
      )
      if (!professor) {
        results.push({ rmp_id: row.rmp_id, name, status: 'error', error: 'Not found on RMP' })
        continue
      }

      const tagCounts = buildTagCounts(professor.ratings ?? [])
      const refreshedAt = new Date().toISOString()

      const updateResult = await withTimeout(
        Promise.resolve(
          db
            .from('professor_cache')
            .update({
              slug: makeSlug(professor.firstName, professor.lastName, professor.id),
              first_name: professor.firstName,
              last_name: professor.lastName,
              department: professor.department,
              school_name: professor.schoolName,
              avg_rating: professor.avgRating,
              avg_difficulty: professor.avgDifficulty,
              would_take_again: professor.wouldTakeAgainPercent,
              num_ratings: professor.numRatings,
              ratings: professor.ratings,
              tag_counts: Object.keys(tagCounts).length > 0 ? tagCounts : null,
              ai_analysis: row.ai_analysis,
              cached_at: refreshedAt,
              search_count: row.search_count ?? 0,
            })
            .eq('rmp_id', row.rmp_id),
        ),
        rowTimeoutMs,
        `Timed out updating cache row after ${rowTimeoutMs}ms`,
      )
      const { error } = updateResult

      if (error) throw new Error(error.message)

      results.push({
        rmp_id: row.rmp_id,
        name: `${professor.firstName} ${professor.lastName}`.trim(),
        status: 'refreshed',
        cached_at: refreshedAt,
        ratings: professor.ratings?.length ?? 0,
      })
    } catch (error) {
      results.push({
        rmp_id: row.rmp_id,
        name,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }

    if (apply && delayMs > 0) await sleep(delayMs)
  }

  printSummary(results)
}

async function fetchStaleRows(): Promise<CacheRow[]> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await db
    .from('professor_cache')
    .select('rmp_id, first_name, last_name, cached_at, ai_analysis, search_count')
    .lt('cached_at', cutoff)
    .order('cached_at', { ascending: true })
    .limit(limit)

  if (error) throw new Error(`Failed to fetch stale cache rows: ${error.message}`)
  return data ?? []
}

function buildTagCounts(ratings: Array<{ tags?: string[] | null }>) {
  const tagCounts: Record<string, number> = {}
  for (const rating of ratings) {
    for (const tag of rating.tags ?? []) {
      const clean = tag.trim()
      if (clean) tagCounts[clean] = (tagCounts[clean] ?? 0) + 1
    }
  }
  return tagCounts
}

function printSummary(results: RefreshResult[]) {
  const refreshed = results.filter(row => row.status === 'refreshed').length
  const wouldRefresh = results.filter(row => row.status === 'would_refresh').length
  const errors = results.filter(row => row.status === 'error')

  for (const row of results.slice(0, 10)) {
    const detail = row.status === 'error'
      ? `error=${row.error}`
      : `cached_at=${row.cached_at ?? 'unknown'}${row.ratings == null ? '' : ` ratings=${row.ratings}`}`
    console.log(`${row.status}: ${row.name} (${row.rmp_id}) ${detail}`)
  }
  if (results.length > 10) console.log(`...and ${results.length - 10} more`)
  if (errors.length > 0) {
    console.log('Error samples:')
    for (const row of errors.slice(0, 10)) {
      console.log(`error: ${row.name} (${row.rmp_id}) ${row.error}`)
    }
    if (errors.length > 10) console.log(`...and ${errors.length - 10} more errors`)
  }

  console.log(`Summary: would_refresh=${wouldRefresh} refreshed=${refreshed} errors=${errors.length}`)
  if (errors.length > 0) process.exitCode = 1
}

function loadEnvFile(fileName: string) {
  const filePath = path.resolve(process.cwd(), fileName)
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const sep = trimmed.indexOf('=')
    if (sep === -1) continue
    const k = trimmed.slice(0, sep)
    const v = trimmed.slice(sep + 1).replace(/^['"]|['"]$/g, '')
    if (!process.env[k]) process.env[k] = v
  }
}

function parsePositiveInt(value: string, name: string) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) fatal(`${name} must be a positive integer.`)
  return parsed
}

function parseNonNegativeInt(value: string, name: string) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) fatal(`${name} must be a non-negative integer.`)
  return parsed
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), ms)
  })

  return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout)
  })
}

function fatal(message: string): never {
  console.error(message)
  process.exit(1)
}

main().catch(error => {
  console.error('Fatal error:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
