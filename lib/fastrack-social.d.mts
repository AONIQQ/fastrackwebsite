export const FASTTRACK_SOCIAL_CAMPAIGN: string
export const FASTTRACK_SOCIAL_PLATFORMS: readonly string[]
export function fastrackSocialPlatform(value: unknown): string | null
export function fastrackSocialCalculatorUrl(input: { platform: unknown }): string | null
export function creatorAccountLabel(input: { campaign: unknown; content: unknown }): string | null
