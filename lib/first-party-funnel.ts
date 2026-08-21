import { sql, transactionClient } from './db'
import { FIRST_PARTY_FUNNEL_REPORT_SQL } from './first-party-funnel-report.mjs'

export type FirstPartyFunnelRow = {
  window: '7d' | '30d'
  traffic_class: 'business' | 'qa'
  source: string
  medium: string
  campaign: string
  content: string | null
  intent: number
  modal_opened: number
  submission_attempted: number
  lead_captured: number
  capture_acknowledged: number
  capture_failed: number
  modal_per_intent: number | null
  attempt_per_modal: number | null
  captured_per_intent: number | null
  captured_per_attempt: number | null
}

export async function recordFirstPartyFunnelEvent(input: {
  sessionDigest: string
  networkDigest: string
  event: string
  source: string
  medium: string
  campaign: string
  content: string | null
  trafficClass: 'business' | 'qa'
}) {
  const database = transactionClient()
  if (typeof database.transaction !== 'function') throw new Error('funnel transaction unavailable')
  const result = await database.transaction((txn) => [
    txn`select pg_advisory_xact_lock(hashtext('fastrack:first-party-funnel-admission'))`,
    txn`
      with known_session as (
        select 1 from calculator_funnel_sessions where session_digest = ${input.sessionDigest}
      ), stale_cleanup as (
        delete from calculator_funnel_ingest_windows where ctid in (
          select ctid from calculator_funnel_ingest_windows
          where expires_at < now() and not exists (select 1 from known_session)
          order by expires_at limit 200
        ) returning 1
      ), capacity_ok as (
        select 1
        where not exists (select 1 from known_session)
          and coalesce((select session_count from calculator_funnel_ingest_windows
            where scope='global' and key_digest=repeat('0',64) and window_start=date_trunc('hour',now())),0) < 500
          and coalesce((select session_count from calculator_funnel_ingest_windows
            where scope='network' and key_digest=${input.networkDigest} and window_start=date_trunc('hour',now())),0) < 10
      ), global_capacity as (
        insert into calculator_funnel_ingest_windows(scope,key_digest,window_start,session_count,expires_at)
        select 'global', repeat('0',64), date_trunc('hour',now()), 1, date_trunc('hour',now()) + interval '2 days'
        where exists (select 1 from capacity_ok)
        on conflict(scope,key_digest,window_start) do update
          set session_count=calculator_funnel_ingest_windows.session_count+1
          where calculator_funnel_ingest_windows.session_count < 500
        returning 1
      ), network_capacity as (
        insert into calculator_funnel_ingest_windows(scope,key_digest,window_start,session_count,expires_at)
        select 'network', ${input.networkDigest}, date_trunc('hour',now()), 1, date_trunc('hour',now()) + interval '2 days'
        where exists (select 1 from capacity_ok) and exists (select 1 from global_capacity)
        on conflict(scope,key_digest,window_start) do update
          set session_count=calculator_funnel_ingest_windows.session_count+1
          where calculator_funnel_ingest_windows.session_count < 10
        returning 1
      ), session_write as (
        insert into calculator_funnel_sessions(session_digest,utm_source,utm_medium,utm_campaign,utm_content,traffic_class)
        select ${input.sessionDigest},${input.source},${input.medium},${input.campaign},${input.content},${input.trafficClass}
        where not exists (select 1 from known_session)
          and exists (select 1 from global_capacity) and exists (select 1 from network_capacity)
        returning 1
      ), accepted_session as (
        select 1 from known_session union all select 1 from session_write limit 1
      ), event_write as (
        insert into calculator_funnel_events(session_digest,event_name)
        select ${input.sessionDigest},${input.event} where exists (select 1 from accepted_session)
        on conflict(session_digest,event_name) do nothing returning 1
      )
      select exists(select 1 from accepted_session) as accepted,
        exists(select 1 from event_write) as recorded
    `,
  ], { isolationLevel: 'ReadCommitted' })
  const rows = result[1] as { accepted: boolean; recorded: boolean }[]
  return rows[0] ?? { accepted: false, recorded: false }
}

export async function firstPartyFunnelReport(): Promise<{ generated_at: string; rows: FirstPartyFunnelRow[] }> {
  const rows = await sql.query(FIRST_PARTY_FUNNEL_REPORT_SQL) as FirstPartyFunnelRow[]
  return { generated_at: new Date().toISOString(), rows }
}
