import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeEmail, verifiedEmailKeys } from '../src/verifiedEmail.js'

test('an invitation address matches only a verified address on the account', () => {
  const keys = verifiedEmailKeys([
    { emailAddress: 'Main@example.test', verification: { status: 'verified' } },
    { emailAddress: ' Secondary@Example.test ', verification: { status: 'verified' } },
    { emailAddress: 'secondary@example.test', verification: { status: 'verified' } },
    { emailAddress: 'pending@example.test', verification: { status: 'unverified' } },
    { emailAddress: 'unknown@example.test' },
    { emailAddress: 'missing@example.test', verification: null },
  ])

  assert.deepEqual(keys, ['main@example.test', 'secondary@example.test'])
  assert.ok(keys.includes(normalizeEmail('  SECONDARY@example.test  ')))
})
