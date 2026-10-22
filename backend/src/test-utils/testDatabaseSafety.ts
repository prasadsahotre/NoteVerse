import { isIP } from 'node:net'

export interface TestDatabaseConfiguration {
  status: 'skip' | 'ready'
  url?: string
  reason?: string
}

interface DatabaseTarget {
  host: string
  port: string
  database: string
}

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:'])
const TEST_DATABASE_NAME = 'noteverse_test'

function parseTarget(value: string): DatabaseTarget | null {
  try {
    const url = new URL(value)
    if (!POSTGRES_PROTOCOLS.has(url.protocol) || !url.hostname) return null
    if (['host', 'hostaddr', 'port', 'service', 'servicefile'].some((key) => url.searchParams.has(key))) return null

    const database = decodeURIComponent(url.pathname.slice(1))
    if (!database || database.includes('/')) return null

    let host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
    const ipVersion = isIP(host)
    if (host === 'localhost' || host === '::1' || (ipVersion === 4 && host.startsWith('127.'))) {
      host = '<loopback>'
    }

    return {
      host,
      port: url.port || '5432',
      database,
    }
  } catch {
    return null
  }
}

/**
 * Returns a skip result only when DATABASE_URL_TEST is absent. Invalid or unsafe targets
 * throw generic errors that never include the supplied URL or its credentials.
 * This guard catches common configuration mistakes; it cannot verify whether a
 * host is production, so operators must independently verify the target.
 */
export function getTestDatabaseConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): TestDatabaseConfiguration {
  const testUrl = environment.DATABASE_URL_TEST
  if (!testUrl) {
    return {
      status: 'skip',
      reason: 'DATABASE_URL_TEST is not configured; database integration tests were skipped.',
    }
  }

  const testTarget = parseTarget(testUrl)
  if (!testTarget) {
    throw new Error('DATABASE_URL_TEST must be a valid PostgreSQL URL.')
  }
  if (testTarget.database !== TEST_DATABASE_NAME) {
    throw new Error(`DATABASE_URL_TEST must target the dedicated database named ${TEST_DATABASE_NAME}.`)
  }

  const developmentUrl = environment.DATABASE_URL
  if (developmentUrl) {
    const developmentTarget = parseTarget(developmentUrl)
    if (!developmentTarget) {
      throw new Error('DATABASE_URL must be a valid PostgreSQL URL to compare test and development targets safely.')
    }
    if (
      testTarget.host === developmentTarget.host &&
      testTarget.port === developmentTarget.port &&
      testTarget.database === developmentTarget.database
    ) {
      throw new Error('DATABASE_URL_TEST points to the same host, port, and database as DATABASE_URL.')
    }
  }

  return { status: 'ready', url: testUrl }
}

export interface CleanupStep {
  label: string
  run: () => Promise<unknown>
}

/** Attempts every cleanup step and returns safe labels without database errors. */
export async function runTestCleanup(steps: CleanupStep[]): Promise<string[]> {
  const failures: string[] = []
  for (const step of steps) {
    try {
      await step.run()
    } catch (error) {
      const errorType = error instanceof Error ? error.name : 'UnknownError'
      failures.push(`${step.label} (${errorType})`)
    }
  }
  return failures
}
