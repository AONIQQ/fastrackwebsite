import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const project = path.resolve(here, '..')
const databaseUrl = process.env.FASTTRACK_T138_DATABASE_URL

test('PostgreSQL requires nullable Neon parameters to carry an explicit text type', {
  skip: databaseUrl ? false : 'isolated FASTTRACK_T138_DATABASE_URL unavailable',
  timeout: 30_000,
}, () => {
  const run = (sql) => spawnSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-X', '-qAt', '-c', sql], {
    encoding: 'utf8',
  })

  const untyped = run('prepare untyped as select $1 is null;')
  assert.notEqual(untyped.status, 0)
  assert.match(untyped.stderr, /could not determine data type of parameter \$1/)

  const typed = run('prepare typed as select $1::text is null; execute typed(null); execute typed(\'digest\');')
  assert.equal(typed.status, 0, typed.stderr)
  assert.equal(typed.stdout.trim(), 't\nf')

  const source = readFileSync(path.join(project, 'lib', 'db.ts'), 'utf8')
  assert.equal((source.match(/\$\{input\.keys\.phone\}::text is (?:not )?null/g) ?? []).length, 4)
  assert.doesNotMatch(source, /\$\{input\.keys\.phone\} is (?:not )?null/)
})
