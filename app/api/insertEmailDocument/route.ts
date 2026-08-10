import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createHash } from 'node:crypto'
import { claimCaptureRisk, cleanupCaptureAbuseState, getCollegeById, insertLead } from '@/lib/db'
import { notifyNewLead } from '@/lib/mail'
import { sendSms, resultsSms } from '@/lib/sms'
import { processResultMessage } from '@/lib/message-ledger'
import { computeRoi } from '@/lib/roi'
import {
  CAPTURE_BODY_LIMIT, CaptureInputError, SMS_CONSENT_VERSION,
  captureFingerprintInput, isAllowedCaptureOrigin, validateCaptureInput,
} from '@/lib/capture.mjs'
import {
  CAPTURE_RATE_POLICIES, CAPTURE_RISK_POLICY_VERSION, CAPTURE_RISK_RETENTION_DAYS,
  CaptureRiskConfigurationError, buildCaptureRiskKeys, captureNetworkAddress, smsDispatchEnabled,
} from '@/lib/capture-abuse.mjs'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    if (process.env.CAPTURE_ACK_ENABLED === '0') {
      return NextResponse.json({ error: 'Capture is temporarily unavailable', code: 'capture_disabled' }, { status: 503 })
    }
    if (!isAllowedCaptureOrigin(request.headers.get('origin'), request.url)) {
      return NextResponse.json({ error: 'Request origin is not allowed', code: 'invalid_origin' }, { status: 403 })
    }
    const declaredLength = Number(request.headers.get('content-length') ?? 0)
    if (declaredLength > CAPTURE_BODY_LIMIT) {
      return NextResponse.json({ error: 'Request is too large', code: 'payload_too_large' }, { status: 413 })
    }
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > CAPTURE_BODY_LIMIT) {
      return NextResponse.json({ error: 'Request is too large', code: 'payload_too_large' }, { status: 413 })
    }
    let body: unknown
    try { body = JSON.parse(raw) } catch { throw new CaptureInputError('invalid_json', 'Invalid request') }
    const input = validateCaptureInput(body, request.url)
    const captureRequestHash = createHash('sha256').update(captureFingerprintInput(input)).digest('hex')
    const riskKeys = buildCaptureRiskKeys({
      secret: process.env.CAPTURE_ABUSE_SECRET,
      network: captureNetworkAddress(request.headers),
      email: input.email,
      phone: input.phone,
    })
    if (!riskKeys) {
      return NextResponse.json({ error: 'Request identity is unavailable', code: 'risk_identity_missing' }, { status: 403 })
    }
    const risk = await claimCaptureRisk({
      captureId: input.captureId,
      requestHash: captureRequestHash,
      policyVersion: CAPTURE_RISK_POLICY_VERSION,
      keys: riskKeys,
      policies: CAPTURE_RATE_POLICIES,
      smsConsentRequested: input.smsConsent,
      retentionDays: CAPTURE_RISK_RETENTION_DAYS,
    })
    if (!risk) {
      return NextResponse.json({ error: 'Capture identity does not match this request', code: 'capture_mismatch' }, { status: 409 })
    }
    if (risk.decision !== 'accepted') {
      return NextResponse.json({ error: 'Please wait before trying again', code: 'rate_limited' }, { status: 429 })
    }
    const college = await getCollegeById(input.collegeId)
    if (!college || college.state !== input.state) throw new CaptureInputError('invalid_college', 'College does not match the selected state')
    const roi = computeRoi(college, input.residency)
    const userAgent = request.headers.get('user-agent')?.slice(0, 512) ?? null
    const utm = Object.fromEntries(Object.entries(input.attribution).filter(([key, value]) => key !== 'normalized_referrer' && value)) as Record<string, string>

    const lead = await insertLead({
      captureId: input.captureId, captureRequestHash, email: input.email, phone: input.phone,
      state: input.state, residency: input.residency, college: college.name,
      collegeId: college.id, snapshot: roi, userAgent,
      smsConsent: input.smsConsent, referrer: input.attribution.normalized_referrer,
      normalizedReferrer: input.attribution.normalized_referrer,
      normalizedPhone: input.phone, utm,
      smsConsentAt: input.smsConsent ? new Date() : null,
      smsConsentVersion: input.smsConsent ? SMS_CONSENT_VERSION : null,
      isFixture: false,
      riskDecisionId: risk.id,
    })
    if (!lead) {
      return NextResponse.json({ error: 'Capture identity does not match this request', code: 'capture_mismatch' }, { status: 409 })
    }

    {
      const deliver = async () => {
        const work: Promise<unknown>[] = [processResultMessage(lead.id)]
        if (lead.delivery_claimed) {
          work.push(notifyNewLead({ email: input.email, phone: input.phone, state: input.state, residency: input.residency, college: college.name, totalAdvantage: roi.totalAdvantage }))
          work.push(
            lead.sms_eligible && smsDispatchEnabled() && input.phone
              ? sendSms(input.phone, resultsSms(college.name, roi.totalAdvantage))
              : Promise.resolve(false),
          )
          work.push(cleanupCaptureAbuseState())
        }
        const outcomes = await Promise.allSettled(work)
        for (const outcome of outcomes) if (outcome.status === 'rejected') console.error('[lead delivery failure]')
      }
      waitUntil(deliver().catch((error) => console.error('[lead delivery]', error)))
    }

    return NextResponse.json({ ok: true, id: lead.id, capture_id: input.captureId, roi: lead.snapshot })
  } catch (error) {
    if (error instanceof CaptureInputError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 })
    }
    if (error instanceof CaptureRiskConfigurationError) {
      return NextResponse.json({ error: 'Capture is temporarily unavailable', code: 'risk_unavailable' }, { status: 503 })
    }
    console.error('Error inserting lead:', error)
    return NextResponse.json({ error: 'Failed to capture results', code: 'capture_failed' }, { status: 500 })
  }
}
