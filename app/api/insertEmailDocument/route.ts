import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createHash } from 'node:crypto'
import { claimCaptureRisk, getCollegeById, insertLead, recordCaptureReportingEvents } from '@/lib/db'
import { notifyNewLead } from '@/lib/mail'
import { sendSms, resultsSms } from '@/lib/sms'
import { processResultMessage } from '@/lib/message-ledger'
import { computeRoi } from '@/lib/roi'
import {
  CAPTURE_BODY_LIMIT, CaptureInputError, SMS_CONSENT_VERSION,
  captureFingerprintInput, isAllowedCaptureOrigin, validateCaptureInput,
} from '@/lib/capture.mjs'
import { attributionValidity, reportingReasonForInputError } from '@/lib/capture-reporting.mjs'
import type { CaptureReportEvent } from '@/lib/db'
import { isAdmin } from '@/lib/admin'
import { verifyFixtureAuthorization } from '@/lib/fixture-authorization.mjs'
import {
  CAPTURE_RATE_POLICIES, CAPTURE_RISK_POLICY_VERSION, CAPTURE_RISK_RETENTION_DAYS,
  CaptureRiskConfigurationError, buildCaptureRiskKeys, captureNetworkAddress, smsDispatchEnabled,
} from '@/lib/capture-abuse.mjs'
import { captureAcknowledgementReady, rolloutControls } from '@/lib/rollout-controls.mjs'

export const dynamic = 'force-dynamic'

async function recordRejected(reasonCode: string, attribution: CaptureReportEvent['attributionValidity'] = 'unknown') {
  try {
    await recordCaptureReportingEvents([
      { eventType: 'attempt', reasonCode: 'none', attributionValidity: attribution, trafficClass: 'unknown' },
      { eventType: 'rejected', reasonCode, attributionValidity: attribution, trafficClass: 'unknown' },
    ])
  } catch {
    console.error('[capture rejection reporting unavailable]')
  }
}

export async function POST(request: Request) {
  let reportingAttribution: CaptureReportEvent['attributionValidity'] = 'unknown'
  let persistenceAttempted = false
  const fixtureAuthorization = request.headers.get('x-fastrack-fixture-authorization')
  const isFixture = fixtureAuthorization !== null
  if (isFixture && (!isAdmin() || !verifyFixtureAuthorization(fixtureAuthorization, process.env.ADMIN_TOKEN))) {
    return NextResponse.json({ error: 'Unauthorized', code: 'fixture_unauthorized' }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  try {
    const controls = rolloutControls()
    if (!captureAcknowledgementReady(controls)) {
      return NextResponse.json({ error: 'Capture is temporarily unavailable', code: 'capture_disabled' }, { status: 503 })
    }
    if (!isAllowedCaptureOrigin(request.headers.get('origin'), request.url)) {
      return NextResponse.json({ error: 'Request origin is not allowed', code: 'invalid_origin' }, { status: 403 })
    }
    const declaredLength = Number(request.headers.get('content-length') ?? 0)
    if (declaredLength > CAPTURE_BODY_LIMIT) {
      await recordRejected('payload_too_large')
      return NextResponse.json({ error: 'Request is too large', code: 'payload_too_large' }, { status: 413 })
    }
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > CAPTURE_BODY_LIMIT) {
      await recordRejected('payload_too_large')
      return NextResponse.json({ error: 'Request is too large', code: 'payload_too_large' }, { status: 413 })
    }
    let body: unknown
    try { body = JSON.parse(raw) } catch { throw new CaptureInputError('invalid_json', 'Invalid request') }
    const input = validateCaptureInput(body, request.url)
    reportingAttribution = attributionValidity(input.attribution)
    const captureRequestHash = createHash('sha256').update(captureFingerprintInput(input)).digest('hex')
    const riskKeys = buildCaptureRiskKeys({
      secret: process.env.CAPTURE_ABUSE_SECRET,
      network: captureNetworkAddress(request.headers),
      email: input.email,
      phone: input.phone,
    })
    if (!riskKeys) {
      await recordRejected('risk_identity_missing', reportingAttribution)
      return NextResponse.json({ error: 'Request identity is unavailable', code: 'risk_identity_missing' }, { status: 403 })
    }
    const risk = await claimCaptureRisk({
      captureId: input.captureId,
      requestHash: captureRequestHash,
      collegeId: input.collegeId,
      state: input.state,
      residency: input.residency,
      policyVersion: CAPTURE_RISK_POLICY_VERSION,
      keys: riskKeys,
      policies: CAPTURE_RATE_POLICIES,
      smsConsentRequested: input.smsConsent,
      retentionDays: CAPTURE_RISK_RETENTION_DAYS,
    })
    if (!risk) {
      await recordRejected('capture_mismatch', reportingAttribution)
      return NextResponse.json({ error: 'Capture identity does not match this request', code: 'capture_mismatch' }, { status: 409 })
    }
    if (risk.validation_code === 'invalid_college') {
      await recordRejected('invalid_college', reportingAttribution)
      return NextResponse.json({ error: 'College does not match the selected state', code: 'invalid_college' }, { status: 400 })
    }
    if (risk.decision !== 'accepted') {
      await recordRejected(risk.reason_code, reportingAttribution)
      return NextResponse.json({ error: 'Please wait before trying again', code: 'rate_limited' }, { status: 429 })
    }
    const college = await getCollegeById(input.collegeId)
    if (!college || college.state !== input.state) throw new CaptureInputError('invalid_college', 'College does not match the selected state')
    const roi = computeRoi(college, input.residency)
    const userAgent = request.headers.get('user-agent')?.slice(0, 512) ?? null
    const utm = Object.fromEntries(Object.entries(input.attribution).filter(([key, value]) => key !== 'normalized_referrer' && value)) as Record<string, string>

    persistenceAttempted = true
    const lead = await insertLead({
      captureId: input.captureId, captureRequestHash, email: input.email, phone: input.phone,
      state: input.state, residency: input.residency, college: college.name,
      collegeId: college.id, snapshot: roi, userAgent,
      smsConsent: input.smsConsent, referrer: input.attribution.normalized_referrer,
      normalizedReferrer: input.attribution.normalized_referrer,
      normalizedPhone: input.phone, utm,
      smsConsentAt: input.smsConsent ? new Date() : null,
      smsConsentVersion: input.smsConsent ? SMS_CONSENT_VERSION : null,
      isFixture,
      riskDecisionId: risk.id,
      attributionValidity: reportingAttribution,
      createShadowLedger: controls.shadowLedger,
      enqueueResults: controls.resultsEnqueue,
    })
    if (!lead) {
      return NextResponse.json({ error: 'Capture identity does not match this request', code: 'capture_mismatch' }, { status: 409 })
    }

    {
      const deliver = async () => {
        const work: Promise<unknown>[] = controls.resultsDispatch ? [processResultMessage(lead.id)] : []
        if (lead.delivery_claimed && controls.resultsDispatch) {
          work.push(notifyNewLead({ email: input.email, phone: input.phone, state: input.state, residency: input.residency, college: college.name, totalAdvantage: roi.totalAdvantage }))
          work.push(
            lead.sms_eligible && smsDispatchEnabled() && input.phone
              ? sendSms(input.phone, resultsSms(college.name, roi.totalAdvantage))
              : Promise.resolve(false),
          )
        }
        const outcomes = await Promise.allSettled(work)
        for (const outcome of outcomes) if (outcome.status === 'rejected') console.error('[lead delivery failure]')
      }
      waitUntil(deliver().catch((error) => console.error('[lead delivery]', error)))
    }

    return NextResponse.json({ ok: true, id: lead.id, capture_id: input.captureId, roi: lead.snapshot })
  } catch (error) {
    if (error instanceof CaptureInputError) {
      await recordRejected(reportingReasonForInputError(error.code), error.code === 'invalid_attribution' || error.code === 'invalid_referrer' ? 'invalid' : reportingAttribution)
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 })
    }
    if (error instanceof CaptureRiskConfigurationError) {
      return NextResponse.json({ error: 'Capture is temporarily unavailable', code: 'risk_unavailable' }, { status: 503 })
    }
    if (persistenceAttempted) {
      // Once the lead statement starts, a failed response cannot prove whether
      // PostgreSQL committed. Before this phase, persistence is known not to
      // have been attempted and must never be reported as uncertain.
      try {
        await recordCaptureReportingEvents([{
          eventType: 'persistence_unconfirmed', reasonCode: 'database_or_response_unconfirmed',
          attributionValidity: reportingAttribution,
          trafficClass: isFixture ? 'fixture' : 'unknown',
        }])
      } catch { console.error('[capture failure unobservable]') }
      console.error('[capture persistence or response unconfirmed]')
    } else {
      console.error('[capture failed before lead persistence]')
    }
    return NextResponse.json({ error: 'Failed to capture results', code: 'capture_failed' }, { status: 500 })
  }
}
