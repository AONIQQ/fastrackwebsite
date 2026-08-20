import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const MIGRATION_FILE = /^(\d{4})_([a-z0-9_]+)\.sql$/
const STATEMENT_BREAK = /^\s*--\s*migrate:split\s*$/m

const FORBIDDEN_SQL = [
  { pattern: /\b(?:INSERT\s+INTO|DELETE\s+FROM|MERGE\s+INTO)\b|(?<!\bON\s)\bUPDATE\b/i, reason: 'row-changing DML is not allowed in additive schema migrations' },
  { pattern: /\bDROP\s+(?:TABLE|COLUMN|CONSTRAINT|INDEX|SCHEMA|TYPE)\b/i, reason: 'DROP operations are not additive' },
  { pattern: /\bTRUNCATE\b/i, reason: 'TRUNCATE is destructive' },
  { pattern: /\bALTER\s+TABLE\b[\s\S]*\bDROP\b/i, reason: 'ALTER TABLE DROP is destructive' },
  { pattern: /\bALTER\s+(?:TABLE|INDEX|SCHEMA|TYPE)\b[\s\S]*\bRENAME\b/i, reason: 'RENAME operations are backward-incompatible' },
  { pattern: /\bALTER\s+TABLE\b[\s\S]*\bALTER\s+(?:COLUMN\s+)?\b/i, reason: 'ALTER COLUMN operations are backward-incompatible' },
  { pattern: /\bALTER\s+TABLE\b[\s\S]*\bADD\s+(?:COLUMN\s+)?(?!CONSTRAINT\b)(?:IF\s+NOT\s+EXISTS\s+)?[^;]*\bNOT\s+NULL\b/i, reason: 'new columns must remain nullable for deployed-source compatibility' },
  { pattern: /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i, reason: 'concurrent indexes cannot run in the migration transaction' },
  { pattern: /\b(?:BEGIN|COMMIT|ROLLBACK)\b/i, reason: 'the runner owns the transaction boundary' },
]

export function checksum(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

export function splitStatements(contents) {
  const statements = contents
    .split(STATEMENT_BREAK)
    .map((statement) => statement.trim())
    .filter(Boolean)

  if (statements.length === 0) throw new Error('migration contains no SQL statements')
  return statements
}

export function assertAdditiveSql(contents, filename = 'migration') {
  // Cross-statement matching can mistake a later additive ALTER TABLE for an
  // ALTER COLUMN clause or attach a later constraint's NOT NULL to an earlier
  // nullable column. The runner executes these same delimiter-defined units.
  for (const statement of splitStatements(contents)) {
    const safetySql = statement
      .replace(/--[^\r\n]*/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/'(?:''|[^'])*'/g, "''")

    const exactAttributionConstraintWidening = (
      filename === '0016_creator_attribution_sources.sql'
        && /^alter\s+table\s+calculator_funnel_sessions\s+drop\s+constraint\s+if\s+exists\s+calculator_funnel_sessions_(?:source|campaign)_check\s*;?$/i.test(safetySql.trim())
    ) || (
      filename === '0017_referral_attribution_source.sql'
        && /^alter\s+table\s+calculator_funnel_sessions\s+drop\s+constraint\s+if\s+exists\s+calculator_funnel_sessions_source_check\s*;?$/i.test(safetySql.trim())
    ) || (
      filename === '0018_podcast_attribution_source.sql'
        && /^alter\s+table\s+calculator_funnel_sessions\s+drop\s+constraint\s+if\s+exists\s+calculator_funnel_sessions_source_check\s*;?$/i.test(safetySql.trim())
    )

    for (const rule of FORBIDDEN_SQL) {
      if (exactAttributionConstraintWidening && (rule.reason === 'DROP operations are not additive' || rule.reason === 'ALTER TABLE DROP is destructive')) continue
      if (rule.pattern.test(safetySql)) throw new Error(`${filename}: ${rule.reason}`)
    }
  }
}

export function parseMigration(filename, contents) {
  const match = MIGRATION_FILE.exec(filename)
  if (!match) throw new Error(`invalid migration filename: ${filename}`)

  assertAdditiveSql(contents, filename)
  return {
    version: match[1],
    name: match[2],
    filename,
    checksum: checksum(contents),
    statements: splitStatements(contents),
  }
}

export async function loadMigrations(directory) {
  const filenames = (await readdir(directory))
    .filter((filename) => filename.endsWith('.sql'))
    .sort()

  const migrations = []
  for (const filename of filenames) {
    const contents = await readFile(path.join(directory, filename), 'utf8')
    migrations.push(parseMigration(filename, contents))
  }

  const versions = new Set()
  for (const migration of migrations) {
    if (versions.has(migration.version)) {
      throw new Error(`duplicate migration version: ${migration.version}`)
    }
    versions.add(migration.version)
  }

  if (migrations.length === 0) throw new Error('no migration files found')
  return migrations
}

export function reconcileMigrations(migrations, appliedRows) {
  const applied = new Map(appliedRows.map((row) => [String(row.version), row]))
  const knownVersions = new Set(migrations.map((migration) => migration.version))

  for (const row of appliedRows) {
    if (!knownVersions.has(String(row.version))) {
      throw new Error(`database contains unknown migration version ${row.version}`)
    }
  }

  return migrations.map((migration) => {
    const row = applied.get(migration.version)
    if (!row) return { ...migration, status: 'pending' }
    if (row.checksum !== migration.checksum) {
      return { ...migration, status: 'checksum-mismatch', appliedChecksum: row.checksum }
    }
    return { ...migration, status: 'applied' }
  })
}
