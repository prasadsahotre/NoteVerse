import 'dotenv/config'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import jwt from 'jsonwebtoken'
import { isJoinWindowOpen, parseScheduledTimestamp } from '../utils/liveSessionValidation.js'

test('strictly validates and normalizes scheduled timestamps', async (t) => {
  const invalidInputs: Array<[string, unknown]> = [
    ['impossible calendar date', '2030-02-30T10:00:00Z'],
    ['invalid leap day', '2030-02-29T10:00:00Z'],
    ['invalid hour', '2030-01-01T24:00:00Z'],
    ['invalid minute', '2030-01-01T10:60:00Z'],
    ['invalid second', '2030-01-01T10:00:60Z'],
    ['malformed offset', '2030-01-01T10:00:00+05:3'],
    ['out-of-range offset', '2030-01-01T10:00:00+14:01'],
    ['missing timezone', '2030-01-01T10:00:00'],
    ['non-string input', 20300101],
  ]

  for (const [label, input] of invalidInputs) {
    await t.test(label, () => {
      assert.equal(typeof parseScheduledTimestamp(input), 'string')
    })
  }

  const validInputs: Array<[string, string, string]> = [
    ['valid Z timestamp', '2030-01-01T10:00:00Z', '2030-01-01T10:00:00.000Z'],
    ['valid fractional seconds', '2030-01-01T10:00:00.123456Z', '2030-01-01T10:00:00.123Z'],
    ['valid leap day', '2028-02-29T10:00:00Z', '2028-02-29T10:00:00.000Z'],
    ['positive offset', '2030-01-01T10:00:00+02:00', '2030-01-01T08:00:00.000Z'],
    ['negative offset', '2030-01-01T10:00:00-05:30', '2030-01-01T15:30:00.000Z'],
  ]

  for (const [label, input, expected] of validInputs) {
    await t.test(label, () => {
      const parsed = parseScheduledTimestamp(input)
      assert.ok(parsed instanceof Date)
      assert.equal(parsed.toISOString(), expected)
    })
  }
})

test('join window includes its opening instant and excludes its closing instant', () => {
  const scheduledAt = new Date('2030-01-01T12:00:00.000Z')
  const durationMinutes = 60
  const opening = scheduledAt.getTime() - 15 * 60_000
  const closing = scheduledAt.getTime() + durationMinutes * 60_000

  assert.equal(isJoinWindowOpen(scheduledAt, durationMinutes, new Date(opening)), true)
  assert.equal(isJoinWindowOpen(scheduledAt, durationMinutes, new Date(opening - 1)), false)
  assert.equal(isJoinWindowOpen(scheduledAt, durationMinutes, new Date(closing - 1)), true)
  assert.equal(isJoinWindowOpen(scheduledAt, durationMinutes, new Date(closing)), false)
  assert.equal(isJoinWindowOpen(scheduledAt, durationMinutes, new Date(closing + 1)), false)
})

const testDatabaseUrl = process.env.DATABASE_URL_TEST

if (!testDatabaseUrl) {
  test('live session authorization and lifecycle', { skip: 'Set DATABASE_URL_TEST to a dedicated migrated test database.' }, () => {})
} else if (!new URL(testDatabaseUrl).pathname.toLowerCase().includes('test')) {
  test('live session authorization and lifecycle', { skip: 'DATABASE_URL_TEST database name must include "test" to protect real data.' }, () => {})
} else {
  test('live session audience, permissions, join window, and lifecycle', async (t) => {
    process.env.DATABASE_URL = testDatabaseUrl
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'noteverse-live-session-test-secret'

    const [{ default: prisma }, { default: app }] = await Promise.all([
      import('../lib/prisma.js'),
      import('../app.js'),
    ])

    const suffix = randomUUID()
    const createdUserIds: number[] = []
    const createdCourseIds: number[] = []
    const createdSessionIds: number[] = []
    const createdEnrollmentIds: number[] = []
    let server: ReturnType<typeof app.listen> | undefined

    try {
      const roles = await prisma.role.findMany({ where: { name: { in: ['EDUCATOR', 'STUDENT'] } } })
      const roleIds = new Map(roles.map((role) => [role.name, role.id]))
      assert.ok(roleIds.has('EDUCATOR'), 'EDUCATOR role must be seeded')
      assert.ok(roleIds.has('STUDENT'), 'STUDENT role must be seeded')

      const createUser = async (name: string, role: 'EDUCATOR' | 'STUDENT', approval = 'NOT_APPLICABLE') => {
        const user = await prisma.user.create({
          data: {
            name,
            email: `${name.toLowerCase().replaceAll(' ', '-')}-${suffix}@example.test`,
            password: 'test-only-password-hash',
            educatorApprovalStatus: approval as 'APPROVED' | 'PENDING' | 'NOT_APPLICABLE',
            roles: { create: { role: { connect: { id: roleIds.get(role)! } } } },
          },
        })
        createdUserIds.push(user.id)
        return user
      }

      const educator = await createUser('Live Session Owner', 'EDUCATOR', 'APPROVED')
      const otherEducator = await createUser('Other Session Owner', 'EDUCATOR', 'APPROVED')
      const pendingEducator = await createUser('Pending Session Owner', 'EDUCATOR', 'PENDING')
      const studentA = await createUser('Session Student A', 'STUDENT')
      const studentB = await createUser('Session Student B', 'STUDENT')
      const studentC = await createUser('Session Student C', 'STUDENT')
      const studentD = await createUser('Session Student D', 'STUDENT')

      const course = await prisma.course.create({ data: { title: `Live session course ${suffix}`, educatorId: educator.id } })
      const otherCourse = await prisma.course.create({ data: { title: `Other session course ${suffix}`, educatorId: otherEducator.id } })
      createdCourseIds.push(course.id, otherCourse.id)

      const enroll = async (userId: number, courseId = course.id) => {
        const enrollment = await prisma.enrollment.create({ data: { userId, courseId } })
        createdEnrollmentIds.push(enrollment.id)
        return enrollment
      }
      const enrollmentA = await enroll(studentA.id)
      const enrollmentB = await enroll(studentB.id)

      server = app.listen(0)
      await new Promise<void>((resolve, reject) => {
        server!.once('listening', resolve)
        server!.once('error', reject)
      })
      const address = server.address() as AddressInfo
      const baseUrl = `http://127.0.0.1:${address.port}/api/v1`
      const tokenFor = (userId: number, role = 'EDUCATOR') => jwt.sign({ userId, roles: [role] }, process.env.JWT_SECRET!)
      const ownerToken = tokenFor(educator.id)
      const otherToken = tokenFor(otherEducator.id)
      const pendingToken = tokenFor(pendingEducator.id)
      const studentAToken = tokenFor(studentA.id, 'STUDENT')
      const studentBToken = tokenFor(studentB.id, 'STUDENT')
      const studentCToken = tokenFor(studentC.id, 'STUDENT')
      const request = (path: string, token?: string, method = 'GET', body?: unknown) => fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const createBody = (changes: Record<string, unknown> = {}) => ({
        courseId: course.id,
        title: 'Scheduled rehearsal',
        description: 'Practice together',
        type: 'GENERAL_LESSON',
        scheduledAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        durationMinutes: 45,
        googleMeetUrl: 'https://meet.google.com/abc-defg-hij',
        audience: { mode: 'ALL_ENROLLED' },
        ...changes,
      })
      const createSession = async (changes: Record<string, unknown> = {}) => {
        const response = await request('/live-sessions', ownerToken, 'POST', createBody(changes))
        const body = await response.json() as { data?: { id: number } }
        if (body.data?.id) createdSessionIds.push(body.data.id)
        return { response, body }
      }

      await t.test('approved owner creates a session and snapshots all enrolled students', async () => {
        const { response, body } = await createSession()
        assert.equal(response.status, 201)
        assert.equal(body.data?.id !== undefined, true)
        const sessionId = body.data!.id
        const audience = await prisma.liveSessionAudience.findMany({ where: { sessionId }, orderBy: { userId: 'asc' } })
        assert.deepEqual(audience.map(({ userId }) => userId), [studentA.id, studentB.id].sort((a, b) => a - b))

        await enroll(studentC.id)
        const updatedAudience = await prisma.liveSessionAudience.findMany({ where: { sessionId } })
        assert.equal(updatedAudience.some(({ userId }) => userId === studentC.id), false)
      })

      await t.test('approval, course ownership, course IDs, and student selection are enforced', async () => {
        assert.equal((await request('/live-sessions', pendingToken, 'POST', createBody())).status, 403)
        assert.equal((await request('/live-sessions', undefined, 'POST', createBody())).status, 401)
        assert.equal((await request('/live-sessions', ownerToken, 'POST', createBody({ courseId: 'nope' }))).status, 400)
        assert.equal((await request('/live-sessions', ownerToken, 'POST', createBody({ courseId: 99999999 }))).status, 404)
        assert.equal((await request('/live-sessions', ownerToken, 'POST', createBody({ courseId: otherCourse.id }))).status, 403)
        assert.equal((await request('/live-sessions', ownerToken, 'POST', createBody({ type: 'OTHER' }))).status, 400)
        assert.equal((await request('/live-sessions', ownerToken, 'POST', createBody({ durationMinutes: 0 }))).status, 400)
        assert.equal((await request('/live-sessions', ownerToken, 'POST', createBody({ scheduledAt: '2030-01-01T10:00:00' }))).status, 400)
        assert.equal((await request('/live-sessions', ownerToken, 'POST', createBody({ audience: { mode: 'SELECTED', studentIds: ['invalid'] } }))).status, 400)
        assert.equal((await request('/live-sessions', ownerToken, 'POST', createBody({ audience: { mode: 'SELECTED', studentIds: [studentA.id, studentD.id] } }))).status, 400)
        const selectedCreate = await request('/live-sessions', ownerToken, 'POST', createBody({ audience: { mode: 'SELECTED', studentIds: [studentA.id] } }))
        assert.equal(selectedCreate.status, 201)
        const selectedBody = await selectedCreate.json() as { data: { id: number } }
        createdSessionIds.push(selectedBody.data.id)
        const selected = await prisma.liveSession.findFirst({ where: { courseId: course.id, audienceMode: 'SELECTED' }, orderBy: { createdAt: 'desc' } })
        assert.ok(selected)
        const selectedStudents = await prisma.liveSessionAudience.findMany({ where: { sessionId: selected.id } })
        assert.deepEqual(selectedStudents.map(({ userId }) => userId), [studentA.id])
      })

      const firstSession = await prisma.liveSession.findFirst({
        where: { courseId: course.id, audienceMode: 'ALL_ENROLLED' },
        orderBy: { createdAt: 'asc' },
      })
      assert.ok(firstSession)

      await t.test('educator management is owner-scoped and student list omits the meeting URL', async () => {
        assert.equal((await request('/live-sessions/educator', ownerToken)).status, 200)
        const otherListResponse = await request('/live-sessions/educator', otherToken)
        assert.equal(otherListResponse.status, 200)
        const otherList = await otherListResponse.json() as { data: Array<{ id: number }> }
        assert.equal(otherList.data.length, 0)
        assert.equal((await request(`/live-sessions/${firstSession.id}`, otherToken, 'PATCH', { title: 'Tampered' })).status, 403)
        assert.equal((await request(`/live-sessions/${firstSession.id}/cancel`, otherToken, 'POST')).status, 403)

        const studentListResponse = await request('/live-sessions/student', studentAToken)
        assert.equal(studentListResponse.status, 200)
        const studentList = await studentListResponse.json() as { data: Array<Record<string, unknown>> }
        assert.ok(studentList.data.some((session) => session.id === firstSession.id))
        assert.equal(JSON.stringify(studentList).includes('abc-defg-hij'), false)
        const studentBList = await request('/live-sessions/student', studentBToken)
        assert.equal(studentBList.status, 200)
        const studentBData = await studentBList.json() as { data: Array<{ id: number }> }
        const selectedForStudentA = await prisma.liveSession.findFirst({
          where: { courseId: course.id, audienceMode: 'SELECTED' },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
        assert.ok(selectedForStudentA)
        assert.ok(!studentBData.data.some((session) => session.id === selectedForStudentA.id))
        assert.equal((await request('/live-sessions/student', undefined)).status, 401)
      })

      await t.test('selected students alone can join during the 15-minute opening window', async () => {
        const selected = await prisma.liveSession.findFirst({ where: { courseId: course.id, audienceMode: 'SELECTED' }, orderBy: { createdAt: 'desc' } })
        assert.ok(selected)
        const invitedJoin = await request(`/live-sessions/${selected.id}/join`, studentAToken, 'POST')
        assert.equal(invitedJoin.status, 200)
        const joinData = await invitedJoin.json() as { data: { googleMeetUrl: string } }
        assert.equal(joinData.data.googleMeetUrl, 'https://meet.google.com/abc-defg-hij')
        assert.equal((await request(`/live-sessions/${selected.id}/join`, studentBToken, 'POST')).status, 404)
        assert.equal((await request(`/live-sessions/${selected.id}/join`, studentCToken, 'POST')).status, 404)

        const tooEarly = await createSession({ scheduledAt: new Date(Date.now() + 20 * 60_000).toISOString() })
        assert.equal(tooEarly.response.status, 201)
        const tooEarlyId = tooEarly.body.data!.id
        assert.equal((await request(`/live-sessions/${tooEarlyId}/join`, studentAToken, 'POST')).status, 409)
      })

      await t.test('scheduled owner can edit the session, clear its URL, and replace its audience atomically', async () => {
        const updatedAt = new Date(Date.now() + 30 * 60_000).toISOString()
        const response = await request(`/live-sessions/${firstSession.id}`, ownerToken, 'PATCH', {
          title: 'Updated session',
          scheduledAt: updatedAt,
          googleMeetUrl: null,
          audience: { mode: 'SELECTED', studentIds: [studentA.id] },
        })
        assert.equal(response.status, 200)
        const stored = await prisma.liveSession.findUnique({ where: { id: firstSession.id } })
        assert.equal(stored?.title, 'Updated session')
        assert.equal(stored?.googleMeetUrl, null)
        assert.equal(stored?.audienceMode, 'SELECTED')
        const audience = await prisma.liveSessionAudience.findMany({ where: { sessionId: firstSession.id } })
        assert.deepEqual(audience.map(({ userId }) => userId), [studentA.id])
      })

      await t.test('invalid Meet hosts, missing links, and terminal sessions cannot be joined', async () => {
        const invalidUrl = await request('/live-sessions', ownerToken, 'POST', createBody({ googleMeetUrl: 'https://meet.example.com/abc-defg-hij' }))
        assert.equal(invalidUrl.status, 400)
        assert.equal((await request('/live-sessions', ownerToken, 'POST', createBody({ googleMeetUrl: 'http://meet.google.com/abc-defg-hij' }))).status, 400)
        assert.equal((await request('/live-sessions', ownerToken, 'POST', createBody({ googleMeetUrl: 'https://meet.google.com:8443/abc-defg-hij' }))).status, 400)
        assert.equal((await request('/live-sessions', ownerToken, 'POST', createBody({ googleMeetUrl: 'not a URL' }))).status, 400)

        const missing = await createSession({ googleMeetUrl: null })
        assert.equal(missing.response.status, 201)
        const missingId = missing.body.data!.id
        assert.equal((await request(`/live-sessions/${missingId}/join`, studentAToken, 'POST')).status, 409)

        const cancelled = await createSession()
        assert.equal(cancelled.response.status, 201)
        const cancelledId = cancelled.body.data!.id
        const cancelledResponse = await request(`/live-sessions/${cancelledId}/cancel`, ownerToken, 'POST')
        assert.equal(cancelledResponse.status, 200)
        assert.equal((await prisma.liveSession.findUnique({ where: { id: cancelledId } }))?.googleMeetUrl, null)
        assert.ok(await prisma.liveSession.findUnique({ where: { id: cancelledId } }))
        assert.equal((await request(`/live-sessions/${cancelledId}/join`, studentAToken, 'POST')).status, 409)
        assert.equal((await request(`/live-sessions/${cancelledId}/complete`, ownerToken, 'POST')).status, 409)

        const completed = await createSession()
        assert.equal(completed.response.status, 201)
        const completedId = completed.body.data!.id
        assert.equal((await request(`/live-sessions/${completedId}/complete`, ownerToken, 'POST')).status, 200)
        assert.equal((await prisma.liveSession.findUnique({ where: { id: completedId } }))?.googleMeetUrl, null)
        assert.ok(await prisma.liveSession.findUnique({ where: { id: completedId } }))
        assert.equal((await request(`/live-sessions/${completedId}/join`, studentAToken, 'POST')).status, 409)
        assert.equal((await request(`/live-sessions/${completedId}`, ownerToken, 'PATCH', { title: 'Terminal edit' })).status, 409)
      })

      await t.test('join is denied after the scheduled end and when enrollment is no longer current', async () => {
        const ended = await createSession({ scheduledAt: new Date(Date.now() + 5 * 60_000).toISOString() })
        assert.equal(ended.response.status, 201)
        const endedId = ended.body.data!.id
        await prisma.liveSession.update({
          where: { id: endedId },
          data: { scheduledAt: new Date(Date.now() - 60 * 60_000) },
        })
        assert.equal((await request(`/live-sessions/${endedId}/join`, studentAToken, 'POST')).status, 409)

        const enrollment = await prisma.enrollment.delete({ where: { id: enrollmentA.id } })
        createdEnrollmentIds.splice(createdEnrollmentIds.indexOf(enrollment.id), 1)
        const studentList = await request('/live-sessions/student', studentAToken)
        assert.equal(studentList.status, 200)
        const studentData = await studentList.json() as { data: Array<{ id: number }> }
        assert.ok(!studentData.data.some((session) => session.id === firstSession.id))
        assert.equal((await request(`/live-sessions/${firstSession.id}/join`, studentAToken, 'POST')).status, 404)
      })

      await t.test('course deletion is blocked when session history exists', async () => {
        const emptyCourse = await prisma.course.create({
          data: { title: `Session history deletion guard ${suffix}`, educatorId: educator.id },
        })
        createdCourseIds.push(emptyCourse.id)
        const enrollment = await enroll(studentD.id, emptyCourse.id)
        const created = await createSession({
          courseId: emptyCourse.id,
          audience: { mode: 'SELECTED', studentIds: [studentD.id] },
        })
        assert.equal(created.response.status, 201)
        await prisma.enrollment.delete({ where: { id: enrollment.id } })
        createdEnrollmentIds.splice(createdEnrollmentIds.indexOf(enrollment.id), 1)

        const response = await request(`/courses/${emptyCourse.id}`, ownerToken, 'DELETE')
        assert.equal(response.status, 409)
      })
    } finally {
      if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()))
      if (createdSessionIds.length > 0) {
        await prisma.liveSessionAudience.deleteMany({ where: { sessionId: { in: createdSessionIds } } })
        await prisma.liveSession.deleteMany({ where: { id: { in: createdSessionIds } } })
      }
      if (createdEnrollmentIds.length > 0) await prisma.enrollment.deleteMany({ where: { id: { in: createdEnrollmentIds } } })
      if (createdCourseIds.length > 0) await prisma.course.deleteMany({ where: { id: { in: createdCourseIds } } })
      if (createdUserIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
      await prisma.$disconnect()
    }
  })
}
