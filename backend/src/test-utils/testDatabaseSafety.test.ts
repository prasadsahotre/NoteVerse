import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getTestDatabaseConfiguration, runTestCleanup } from './testDatabaseSafety.js'

const validEnvironment = {
  DATABASE_URL: 'postgresql://dev-user:dev-secret@db-dev.example:5432/noteverse',
  DATABASE_URL_TEST: 'postgresql://test-user:test-secret@db-test.example:5432/noteverse_test',
}

test('test database guard skips clearly when DATABASE_URL_TEST is missing', () => {
  const configuration = getTestDatabaseConfiguration({ DATABASE_URL: validEnvironment.DATABASE_URL })
  assert.equal(configuration.status, 'skip')
  assert.match(configuration.reason ?? '', /DATABASE_URL_TEST is not configured/)
})

test('test database guard rejects malformed URLs without echoing credentials', () => {
  const secret = 'malformed-user-secret'
  assert.throws(
    () => getTestDatabaseConfiguration({ DATABASE_URL_TEST: `postgresql://user:${secret}@db.example:invalid/noteverse_test` }),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /valid PostgreSQL URL/)
      assert.ok(!error.message.includes(secret))
      return true
    },
  )
})

test('test database guard rejects unsupported protocols', () => {
  assert.throws(
    () => getTestDatabaseConfiguration({
      DATABASE_URL_TEST: 'mysql://user:secret@localhost:3306/noteverse_test',
    }),
    /valid PostgreSQL URL/,
  )
})

test('test database guard rejects connection parameters that can override the parsed target', () => {
  assert.throws(
    () => getTestDatabaseConfiguration({
      DATABASE_URL_TEST: 'postgresql://user:secret@safe.example:5432/noteverse_test?host=other.example',
    }),
    /valid PostgreSQL URL/,
  )
})

test('test database guard requires the exact dedicated database name', () => {
  assert.throws(
    () => getTestDatabaseConfiguration({
      DATABASE_URL_TEST: 'postgresql://user:secret@localhost:5432/not-a-test-database',
    }),
    /dedicated database named noteverse_test/,
  )
})

test('test database guard rejects a normalized development target match', () => {
  assert.throws(
    () => getTestDatabaseConfiguration({
      DATABASE_URL: 'postgres://dev-user:dev-secret@localhost/noteverse_test',
      DATABASE_URL_TEST: 'postgresql://test-user:test-secret@127.0.0.1:5432/noteverse_test',
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /same host, port, and database/)
      assert.ok(!error.message.includes('dev-secret'))
      assert.ok(!error.message.includes('test-secret'))
      return true
    },
  )
})

test('test database guard accepts a dedicated PostgreSQL target', () => {
  const configuration = getTestDatabaseConfiguration(validEnvironment)
  assert.deepEqual(configuration, { status: 'ready', url: validEnvironment.DATABASE_URL_TEST })
})

test('cleanup attempts later steps even after an earlier failure', async () => {
  const attempted: string[] = []
  const failures = await runTestCleanup([
    { label: 'failed query', run: async () => { attempted.push('first'); throw new Error('private connection detail') } },
    { label: 'disconnect', run: async () => { attempted.push('second') } },
  ])
  assert.deepEqual(attempted, ['first', 'second'])
  assert.deepEqual(failures, ['failed query (Error)'])
  assert.ok(!failures.join(' ').includes('private connection detail'))
})
