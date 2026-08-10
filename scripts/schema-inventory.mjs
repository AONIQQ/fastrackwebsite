import process from 'node:process'
import { neon } from '@neondatabase/serverless'

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required')

const sql = neon(databaseUrl)
const tables = await sql.query(`
  select table_name
  from information_schema.tables
  where table_schema = current_schema()
    and table_type = 'BASE TABLE'
  order by table_name
`)
const columns = await sql.query(`
  select
    table_name,
    column_name,
    data_type,
    udt_name,
    is_nullable,
    (column_default is not null) as has_default
  from information_schema.columns
  where table_schema = current_schema()
  order by table_name, ordinal_position
`)
const constraints = await sql.query(`
  select
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    coalesce(string_agg(kcu.column_name, ',' order by kcu.ordinal_position), '') as columns
  from information_schema.table_constraints tc
  left join information_schema.key_column_usage kcu
    on tc.constraint_catalog = kcu.constraint_catalog
   and tc.constraint_schema = kcu.constraint_schema
   and tc.constraint_name = kcu.constraint_name
   and tc.table_name = kcu.table_name
  where tc.table_schema = current_schema()
    and tc.constraint_type in ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')
  group by tc.table_name, tc.constraint_name, tc.constraint_type
  order by tc.table_name, tc.constraint_type, tc.constraint_name
`)
const indexes = await sql.query(`
  select tablename as table_name, indexname as index_name, indexdef as definition
  from pg_indexes
  where schemaname = current_schema()
  order by tablename, indexname
`)

console.log(JSON.stringify({ tables, columns, constraints, indexes }, null, 2))
