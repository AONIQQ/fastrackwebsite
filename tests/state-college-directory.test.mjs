import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('../app/savings/[state]/page.tsx', import.meta.url), 'utf8')
const db = readFileSync(new URL('../lib/db.ts', import.meta.url), 'utf8')

test('state pages keep the featured cost table and expose only its remaining colleges in a crawlable directory', () => {
  assert.match(page, /getTopCollegesForState\(code, 20\)/)
  assert.match(page, /getCollegesByState\(code\)/)
  assert.match(page, /const featuredIds = new Set\(colleges\.map\(\(college\) => college\.id\)\)/)
  assert.match(page, /\.filter\(\(college\) => !featuredIds\.has\(college\.id\)\)/)
  assert.match(page, /<details[\s\S]*<ul[\s\S]*directoryColleges\.map[\s\S]*<Link/)
  assert.match(page, /collegeSlug\(college\.id, college\.name\)/)
})

test('directory exposes only clean college discovery URLs while calculator actions stay prefilled', () => {
  assert.match(page, /href=\{`\/college\/\$\{collegeSlug\(college\.id, college\.name\)\}`\}/)
  assert.doesNotMatch(page, /withAttributionQuery\(`\/college\//)
  assert.match(page, /`\/calculator\?state=\$\{code\}&residency=inState\$\{collegeId \? `&collegeId=\$\{collegeId\}` : ''\}`/)
  assert.match(page, /href=\{calculatorHref\(c\.id\)\}/)
})

test('the all-college query is bounded to one state and the established computable population', () => {
  assert.match(db, /export async function getCollegesByState\(state: string\)/)
  assert.match(db, /where state = \$\{state\.toUpperCase\(\)\} and \$\{sql\.unsafe\(COMPUTABLE\)\}/)
  assert.doesNotMatch(page, /page=|cursor=|load more/i)
})
