import { cookies } from 'next/headers'
import { timingSafeEqual } from 'node:crypto'

/**
 * Deliberately minimal gate for the internal leads view: a single shared token
 * in ADMIN_TOKEN, compared in constant time, held in an httpOnly cookie.
 *
 * This is a one-operator internal page holding names, emails and phone numbers.
 * If more than one person ever needs access, replace this with real auth rather
 * than sharing the token around.
 */
export function isAdmin(): boolean {
  const expected = process.env.ADMIN_TOKEN
  if (!expected) return false

  const supplied = cookies().get('fastrack_admin')?.value
  if (!supplied) return false

  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
