import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../lib/states.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleShim = { exports: {} }
new Function('exports', 'module', compiled)(moduleShim.exports, moduleShim)

const { stateDirectoryHref } = moduleShim.exports

test('territory college codes never produce unsupported state-directory links', () => {
  for (const code of ['AS', 'FM', 'GU', 'MH', 'MP', 'PR', 'PW', 'VI']) {
    assert.equal(stateDirectoryHref(code), null, code)
  }
})

test('supported state and district codes retain their exact directory routes', () => {
  assert.equal(stateDirectoryHref('PA'), '/savings/pennsylvania')
  assert.equal(stateDirectoryHref('pa'), '/savings/pennsylvania')
  assert.equal(stateDirectoryHref('DC'), '/savings/washington-d-c-')
})

test('college pages condition both state-directory links but preserve state calculator prefill', async () => {
  const college = await readFile(new URL('../app/college/[slug]/page.tsx', import.meta.url), 'utf8')
  assert.equal((college.match(/<Link href=\{stateHref\}/g) ?? []).length, 2)
  assert.match(college, /stateHref \? \(/)
  assert.equal((college.match(/\) : stateName/g) ?? []).length, 2)
  assert.match(college, /state=\$\{c\.state\}&residency=inState&collegeId=\$\{c\.id\}/)
  assert.doesNotMatch(college, /href=\{`\/savings\/\$\{stateSlug\(c\.state\)\}`\}/)
})
