-- ==========================================================================
-- Migration 018: Pre-aggregated tag counts in professor_cache
--
-- Adds a tag_counts jsonb column so the professor profile page can render
-- the tag cloud from a single cached value instead of aggregating across
-- the entire ratings array on every page load.
-- Populated by /api/analyze on the next cache refresh per professor.
-- ==========================================================================

ALTER TABLE professor_cache ADD COLUMN IF NOT EXISTS tag_counts jsonb;
