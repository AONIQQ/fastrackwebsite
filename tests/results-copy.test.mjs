import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('results email uses the calculator model disclosures and current offer', async () => {
  const source = await read('../lib/mail.ts')

  assert.match(source, /four-year cost estimate beside a modeled two-year dual-credit scenario/)
  assert.match(source, /Estimated scenario difference/)
  assert.match(source, /60 dual-credit hours at \$80 per credit and two years enrolled at the selected college/)
  assert.match(source, /average for federal-aid recipients, not a personalized aid offer/)
  assert.match(source, /early-earnings figure adds two years of[\s\S]*Scorecard median post-enrollment earnings and is not an individual wage forecast/)
  assert.match(source, /Results vary with[\s\S]*residency, aid, state, school, degree, transfer decisions, course availability, and course selection/)
  assert.match(source, /receiving college (?:can change or interpret its rules|makes the final decision)/)
  assert.match(source, /A two-year path may not be available/)
  assert.match(source, /Explore the \$497 Credit Map/)
  assert.match(source, /subject: `\$\{r\.collegeName\}: your modeled cost scenario`/)

  assert.doesNotMatch(source, /With Fastrack \(2 years\)|same degree costs finishing in two|Money saved:|years back|The savings are real|entering the workforce .* years earlier/)
})

test('results SMS carries a concise model label and material limitations', async () => {
  const source = await read('../lib/sms.ts')

  assert.match(source, /Your modeled estimate is \$\{money\}/)
  assert.match(source, /60 credits at \$80, average net price for federal-aid recipients/)
  assert.match(source, /2 years of median post-enrollment earnings/)
  assert.match(source, /Transfer, degree fit, residency and aid vary/)
  assert.match(source, /See your email/)
  assert.match(source, /Reply STOP to opt out/)

  assert.doesNotMatch(source, /2 years back|finishing in 2 instead of 4|guaranteed|personalized/)

  const longestExpectedAsciiBody = [
    'Fastrack:',
    'Your modeled estimate is $999,999,999.',
    'Assumes 60 credits at $80, average net price for federal-aid recipients, plus 2 years of median post-enrollment earnings.',
    'Transfer, degree fit, residency and aid vary.',
    'See your email.',
    'Reply STOP to opt out.',
  ].join(' ')
  assert.ok(longestExpectedAsciiBody.length <= 306, 'expected results SMS to fit within two GSM-7 concatenated segments')
})

test('results copy contains no em dash', async () => {
  const source = `${await read('../lib/mail.ts')}\n${await read('../lib/sms.ts')}`
  assert.doesNotMatch(source, /—/)
})
