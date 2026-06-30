import assert from 'node:assert/strict'
import test from 'node:test'

import { absoluteUrl, createRouteMetadata, resolveSiteUrl } from './seo'

test('resolveSiteUrl uses a valid configured app URL without trailing slash', () => {
  assert.equal(resolveSiteUrl('https://example.edu/'), 'https://example.edu')
  assert.equal(resolveSiteUrl('http://localhost:3000'), 'http://localhost:3000')
})

test('resolveSiteUrl falls back when the configured URL is missing or invalid', () => {
  assert.equal(resolveSiteUrl(''), 'https://rurate-web-production.up.railway.app')
  assert.equal(resolveSiteUrl('not-a-url'), 'https://rurate-web-production.up.railway.app')
})

test('absoluteUrl normalizes route paths against the site URL', () => {
  assert.equal(absoluteUrl('courses'), 'https://rurate-web-production.up.railway.app/courses')
  assert.equal(absoluteUrl('/courses'), 'https://rurate-web-production.up.railway.app/courses')
})

test('createRouteMetadata includes canonical, Open Graph, and Twitter fields', () => {
  const metadata = createRouteMetadata({
    title: 'Find Rutgers Courses | RU Rate',
    description: 'Search Rutgers courses.',
    path: '/courses',
  })

  assert.equal(metadata.title, 'Find Rutgers Courses | RU Rate')
  assert.equal(metadata.description, 'Search Rutgers courses.')
  assert.equal(metadata.alternates?.canonical, 'https://rurate-web-production.up.railway.app/courses')
  assert.equal(metadata.openGraph?.title, 'Find Rutgers Courses | RU Rate')
  assert.equal(metadata.twitter?.title, 'Find Rutgers Courses | RU Rate')
})
