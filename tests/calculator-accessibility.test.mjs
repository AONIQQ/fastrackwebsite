import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('calculator exposes names and required state for every choice', async () => {
  const page = await read('../app/calculator/page.tsx')
  const picker = await read('../app/calculator/CollegeCombobox.tsx')

  for (const id of ['state-label', 'residency-label', 'college-label']) {
    assert.match(page, new RegExp(`id="${id}"`))
  }
  assert.match(page, /<Select name="state" required/)
  assert.match(page, /aria-labelledby="state-label" aria-required="true"/)
  assert.match(page, /<Select name="residency" required/)
  assert.match(page, /aria-labelledby="residency-label" aria-required="true"/)
  assert.match(page, /labelId="college-label"/)
  assert.match(picker, /aria-labelledby=\{labelId\}/)
  assert.match(picker, /aria-required="true"/)
})

test('college search exposes keyboard selection state', async () => {
  const picker = await read('../app/calculator/CollegeCombobox.tsx')

  assert.match(picker, /aria-labelledby=\{labelId\}[\s\S]*aria-controls="college-options"/)
  assert.doesNotMatch(picker, /<button[\s\S]{0,180}role="combobox"/)
  assert.match(picker, /aria-labelledby=\{`\$\{labelId\} college-trigger-value`\}/)
  assert.match(picker, /<span id="college-trigger-value"/)
  assert.match(picker, /aria-controls="college-options"/)
  assert.match(picker, /aria-activedescendant=/)
  assert.match(picker, /aria-autocomplete="list"/)
  assert.match(picker, /aria-required="true"/)
  assert.match(picker, /id=\{`college-option-\$\{o\.id\}`\}/)
  assert.match(picker, /id="college-options"[^>]+role="listbox"/)
  assert.match(picker, /e\.key === 'ArrowDown'/)
  assert.match(picker, /e\.key === 'ArrowUp'/)
  assert.match(picker, /e\.key === 'Enter'/)
  assert.match(picker, /e\.key === 'Escape'/)
  assert.match(picker, /triggerRef\.current\?\.focus\(\)/)
  assert.match(picker, /if \(wasOpenRef\.current\)/)
})

test('capture form supports autofill, mobile keyboards, invalid state, and announced failures', async () => {
  const page = await read('../app/calculator/page.tsx')

  assert.match(page, /id="email" name="email" type="email"/)
  assert.match(page, /required autoComplete="email" inputMode="email"/)
  assert.match(page, /aria-invalid=\{emailInvalid \|\| undefined\}/)
  assert.match(page, /id="email-error" role="alert"/)
  assert.match(page, /id="phone" name="phone" type="tel"/)
  assert.match(page, /autoComplete="tel" inputMode="tel"/)
  assert.match(page, /name="smsConsent" type="checkbox"/)
  assert.match(page, /ref=\{captureErrorRef\} tabIndex=\{-1\} role="alert"/)
  assert.match(page, /if \(captureError\) captureErrorRef\.current\?\.focus\(\)/)
})

test('loading and results are announced without weakening the capture gate', async () => {
  const page = await read('../app/calculator/page.tsx')

  assert.match(page, /role="status" aria-live="polite" aria-busy="true"/)
  assert.match(page, /Calculating your results\./)
  assert.match(page, /ref=\{resultHeadingRef\} tabIndex=\{-1\}/)
  assert.match(page, /if \(result\) resultHeadingRef\.current\?\.focus\(\)/)
  assert.match(page, /await completeCapture\(/)
  assert.match(page, /onAcknowledged: \(\{ roi, acknowledgement \}/)
  assert.match(page, /setResult\(roi\)/)
  assert.match(page, /setIsEmailModalOpen\(false\)/)
})

test('small modal actions and disclosures meet the scoped usability bar', async () => {
  const page = await read('../app/calculator/page.tsx')
  const picker = await read('../app/calculator/CollegeCombobox.tsx')
  const dialog = await read('../components/ui/dialog.tsx')

  assert.match(picker, /aria-label="Clear college search" className="-m-3 flex h-11 w-11 shrink-0/)
  assert.match(dialog, /DialogPrimitive\.Close className="[^"]*h-11 w-11/)
  assert.match(page, /className="text-center text-sm leading-relaxed text-slate-600"/)
  assert.match(page, /className="text-sm leading-relaxed text-slate-600"/)
})

test('every dismiss path restores focus to the calculator action that opened the modal', async () => {
  const page = await read('../app/calculator/page.tsx')
  const picker = await read('../app/calculator/CollegeCombobox.tsx')

  assert.match(page, /modalReturnFocusRef = useRef<HTMLButtonElement \| null>\(null\)/)
  assert.match(page, /restoreModalFocusRef = useRef\(false\)/)
  assert.match(page, /modalReturnFocusRef\.current = residencyActionRef\.current/)
  assert.match(page, /modalReturnFocusRef\.current = collegeActionRef\.current/)
  assert.match(page, /openEmailModal\(requestResultsActionRef\.current\)/)
  assert.match(page, /if \(!open\) restoreModalFocusRef\.current = true/)
  assert.match(page, /onCloseAutoFocus=\{handleEmailModalCloseAutoFocus\}/)
  assert.match(page, /event\.preventDefault\(\)[\s\S]*if \(restoreModalFocusRef\.current\) modalReturnFocusRef\.current\?\.focus\(\)/)
  assert.match(picker, /onActionReady\?: \(action: HTMLButtonElement \| null\) => void/)
  assert.match(picker, /onActionReady\?\.\(node\)/)
})
