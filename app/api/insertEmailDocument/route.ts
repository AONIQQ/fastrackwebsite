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
import { fixtureDiagnosticAuthorization } from '@/lib/fixture-authorization.mjs'
import {
  CAPTURE_RATE_POLICIES, CAPTURE_RISK_POLICY_VERSION, CAPTURE_RISK_RETENTION_DAYS,
  CaptureRiskConfigurationError, buildCaptureRiskKeys, captureNetworkAddress, smsDispatchEnabled,
} from '@/lib/capture-abuse.mjs'
import { captureRolloutPlan, effectiveRolloutControls, rolloutControls } from '@/lib/rollout-controls.mjs'
import { captureFailureHttpResponse, captureFailureResponse } from '@/lib/capture-failure-diagnostics.mjs'
import { fixedCaptureErrorResponse, inputCaptureErrorResponse } from '@/lib/capture-route-errors.mjs'
import type { CaptureFailurePhase } from '@/lib/capture-failure-diagnostics.mjs'

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
  let failurePhase: CaptureFailurePhase | null = null
  const fixtureAuthorization = request.headers.get('x-fastrack-fixture-authorization')
  const isFixture = fixtureAuthorization !== null
  const allowedOrigin = isAllowedCaptureOrigin(request.headers.get('origin'), request.url)
  const fixtureDiagnosticAuthorized = fixtureDiagnosticAuthorization({
    token: fixtureAuthorization,
    allowedOrigin,
    admin: isFixture && isAdmin(),
    secret: process.env.ADMIN_TOKEN,
  })
  if (isFixture && !fixtureDiagnosticAuthorized) {
    return fixedCaptureErrorResponse('fixture_unauthorized')
  }
  try {
    const configuredControls = rolloutControls()
    const controls = effectiveRolloutControls(configuredControls)
    const capturePlan = captureRolloutPlan(configuredControls, { fixture: isFixture })
    if (!capturePlan.persist) {
      return fixedCaptureErrorResponse('capture_disabled')
    }
    if (!allowedOrigin) {
      return fixedCaptureErrorResponse('invalid_origin')
    }
    const declaredLength = Number(request.headers.get('content-length') ?? 0)
    if (declaredLength > CAPTURE_BODY_LIMIT) {
      await recordRejected('payload_too_large')
      return fixedCaptureErrorResponse('payload_too_large')
    }
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > CAPTURE_BODY_LIMIT) {
      await recordRejected('payload_too_large')
      return fixedCaptureErrorResponse('payload_too_large')
    }
    let body: unknown
    try { body = JSON.parse(raw) } catch { throw new CaptureInputError('invalid_json', 'Invalid request') }
    const input = validateCaptureInput(body, request.url)
    const captureAttribution = attributionValidity(input.attribution)
    reportingAttribution = captureAttribution
    const captureRequestHash = createHash('sha256').update(captureFingerprintInput(input)).digest('hex')
    const riskKeys = buildCaptureRiskKeys({
      secret: process.env.CAPTURE_ABUSE_SECRET,
      network: captureNetworkAddress(request.headers),
      email: input.email,
      phone: input.phone,
    })
    if (!riskKeys) {
      await recordRejected('risk_identity_missing', reportingAttribution)
      return fixedCaptureErrorResponse('risk_identity_missing')
    }
    failurePhase = 'risk_claim'
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
    failurePhase = null
    if (!risk) {
      await recordRejected('capture_mismatch', reportingAttribution)
      return fixedCaptureErrorResponse('capture_mismatch')
    }
    if (risk.validation_code === 'invalid_college') {
      await recordRejected('invalid_college', reportingAttribution)
      return fixedCaptureErrorResponse('invalid_college')
    }
    if (risk.decision !== 'accepted') {
      await recordRejected(risk.reason_code, reportingAttribution)
      return fixedCaptureErrorResponse('rate_limited')
    }
    failurePhase = 'college_lookup'
    const college = await getCollegeById(input.collegeId)
    failurePhase = null
    if (!college || college.state !== input.state) throw new CaptureInputError('invalid_college', 'College does not match the selected state')
    failurePhase = 'roi_compute'
    const roi = computeRoi(college, input.residency)
    failurePhase = null
    const userAgent = request.headers.get('user-agent')?.slice(0, 512) ?? null
    const utm = Object.fromEntries(Object.entries(input.attribution).filter(([key, value]) => key !== 'normalized_referrer' && value)) as Record<string, string>

    persistenceAttempted = true
    failurePhase = 'lead_insert'
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
      attributionValidity: captureAttribution,
      createShadowLedger: capturePlan.createShadowLedger,
      enqueueResults: capturePlan.enqueueResults,
    })
    failurePhase = null
    if (!lead) {
      return fixedCaptureErrorResponse('capture_mismatch')
    }

    if (isFixture) {
      if (lead.fixture_blocked || !lead.shadow_ready) {
        return NextResponse.json({
          ok: false,
          fixture: true,
          code: 'fixture_shadow_conflict',
          rollout_stage: 'not_shadow',
        }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
      }
      return NextResponse.json({
        ok: false,
        fixture: true,
        code: 'fixture_shadow_recorded',
        rollout_stage: 'shadow',
      }, { status: 202, headers: { 'Cache-Control': 'no-store' } })
    }

    {
      if (lead.id === null || lead.snapshot === null) throw new Error('capture persistence invariant failed')
      const leadId = lead.id
      const deliver = async () => {
        const work: Promise<unknown>[] = controls.resultsDispatch ? [processResultMessage(leadId)] : []
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
      waitUntil(deliver().catch(() => console.error('[lead delivery failure]')))
    }

    return NextResponse.json({ ok: true, id: lead.id, capture_id: input.captureId, roi: lead.snapshot })
  } catch (error) {
    if (error instanceof CaptureInputError) {
      await recordRejected(reportingReasonForInputError(error.code), error.code === 'invalid_attribution' || error.code === 'invalid_referrer' ? 'invalid' : reportingAttribution)
      return inputCaptureErrorResponse(error.message, error.code)
    }
    if (error instanceof CaptureRiskConfigurationError) {
      return fixedCaptureErrorResponse('risk_unavailable')
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
      } catch { /* The final failure log below is the only permitted diagnostic. */ }
    }
    const failure = captureFailureResponse(fixtureDiagnosticAuthorized, failurePhase, error)
    if (failure.diagnostic !== null) console.error(JSON.stringify(failure.diagnostic))
    return captureFailureHttpResponse(failure)
  }
}
