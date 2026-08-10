import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'
import { loadMigrations, reconcileMigrations } from './lib/migrations.mjs'

const command = process.argv[2] ?? 'plan'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = path.join(root, 'db', 'migrations')
const ledger = 'fastrack_schema_migrations'
const advisoryLock = 917_320_247

function databaseUrl({ requireDirect = false } = {}) {
  const value = process.env.DATABASE_URL_UNPOOLED || (!requireDirect && process.env.DATABASE_URL)
  if (!value) {
    throw new Error(requireDirect
      ? 'DATABASE_URL_UNPOOLED is required for apply'
      : 'DATABASE_URL_UNPOOLED or DATABASE_URL is required for read-only inspection')
  }
  return value
}

async function appliedRows(sql) {
  const [{ exists }] = await sql.query(
    'select to_regclass($1) is not null as exists',
    [`public.${ledger}`],
  )
  if (!exists) return []
  return sql.query(
    `select version, checksum from ${ledger} order by version`,
  )
}

function printPlan(rows) {
  for (const row of rows) {
    console.log(`${row.version} ${row.name} ${row.status} sha256:${row.checksum.slice(0, 12)} statements:${row.statements.length}`)
  }
}

async function main() {
  const migrations = await loadMigrations(directory)

  if (command === 'plan') {
    printPlan(migrations.map((migration) => ({ ...migration, status: 'local' })))
    return
  }

  if (!['status', 'verify', 'apply'].includes(command)) {
    throw new Error('usage: node scripts/migrations.mjs <plan|status|verify|apply>')
  }

  if (command === 'apply' && process.env.ALLOW_DATABASE_MIGRATIONS !== '1') {
    throw new Error('apply requires ALLOW_DATABASE_MIGRATIONS=1 and explicit owner-approved change control')
  }

  const sql = neon(databaseUrl({ requireDirect: command === 'apply' }))
  let rows = reconcileMigrations(migrations, await appliedRows(sql))
  printPlan(rows)

  const mismatch = rows.find((row) => row.status === 'checksum-mismatch')
  if (mismatch) throw new Error(`applied migration ${mismatch.version} has changed on disk`)

  if (command === 'status') return
  if (command === 'verify') {
    const pending = rows.filter((row) => row.status === 'pending')
    if (pending.length) throw new Error(`${pending.length} migration(s) are pending`)
    return
  }

  for (const migration of rows.filter((row) => row.status === 'pending')) {
    await sql.transaction((tx) => [
      tx.query('select pg_advisory_xact_lock($1)', [advisoryLock]),
      ...migration.statements.map((statement) => tx.query(statement)),
      tx.query(
        `insert into ${ledger} (version, name, checksum) values ($1, $2, $3)`,
        [migration.version, migration.name, migration.checksum],
      ),
    ])
    console.log(`applied ${migration.version} ${migration.name}`)
  }

  rows = reconcileMigrations(migrations, await appliedRows(sql))
  const incomplete = rows.filter((row) => row.status !== 'applied')
  if (incomplete.length) throw new Error('post-apply verification failed')
  console.log(`verified ${rows.length} applied migration(s)`)
}

main().catch((error) => {
  console.error(`migration error: ${error.message}`)
  process.exitCode = 1
})
