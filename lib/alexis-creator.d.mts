export const ALEXIS_CREATOR_CAMPAIGN: string
export const ALEXIS_CREATOR_PLATFORMS: readonly string[]
export const ALEXIS_CREATOR_VIDEOS: readonly { id: string; label: string }[]
export function alexisCreatorPlatform(value: unknown): string | null
export function alexisCreatorVideo(value: unknown): string | null
export function alexisCreatorContent(video: unknown): string | null
export function alexisCalculatorUrl(input: { platform: unknown; video: unknown }): string | null
export function alexisCreatorVideoLabel(content: unknown): string | null
