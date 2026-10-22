import 'dotenv/config'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import jwt from 'jsonwebtoken'
import { getTestDatabaseConfiguration, runTestCleanup } from '../test-utils/testDatabaseSafety.js'

const testDatabase = getTestDatabaseConfiguration()

if (testDatabase.status === 'skip') {
  test('educator enrollment data isolation', { skip: testDatabase.reason }, () => {})
} else {
  test('educator enrollment data isolation and authorization', async (t) => {
    process.env.DATABASE_URL = testDatabase.url!
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'noteverse-enrollment-test-secret'

    const [{ default: prisma }, { default: app }] = await Promise.all([
      import('../lib/prisma.js'),
      import('../app.js'),
    ])

    const suffix = randomUUID()
    const createdUserIds: number[] = []
    const createdCourseIds: number[] = []
    const createdEnrollmentIds: number[] = []
    let server: ReturnType<typeof app.listen> | undefined
    let primaryFailure: unknown

    try {
      await Promise.all(['EDUCATOR', 'STUDENT', 'ADMIN'].map((name) => prisma.role.upsert({
        where: { name },
        update: {},
        create: { name },
      })))
      const roles = await prisma.role.findMany({
        where: { name: { in: ['EDUCATOR', 'STUDENT', 'ADMIN'] } },
      })
      const roleIds = new Map(roles.map((role) => [role.name, role.id]))
      assert.ok(roleIds.has('EDUCATOR'), 'EDUCATOR role fixture must exist')
      assert.ok(roleIds.has('STUDENT'), 'STUDENT role fixture must exist')
      assert.ok(roleIds.has('ADMIN'), 'ADMIN role fixture must exist')

      const createUser = async (
        name: string,
        role: 'EDUCATOR' | 'STUDENT' | 'ADMIN',
        educatorApprovalStatus: 'NOT_APPLICABLE' | 'PENDING' | 'APPROVED' | 'REJECTED',
      ) => {
        const user = await prisma.user.create({
          data: {
            name,
            email: `${name.toLowerCase().replaceAll(' ', '-')}-${suffix}@example.test`,
            password: 'test-only-password-hash',
            educatorApprovalStatus,
            roles: { create: { role: { connect: { id: roleIds.get(role)! } } } },
          },
        })
        createdUserIds.push(user.id)
        return user
      }

      const createCourse = async (title: string, educatorId: number) => {
        const course = await prisma.course.create({
          data: { title: `${title}-${suffix}`, educatorId },
        })
        createdCourseIds.push(course.id)
        return course
      }

      const educatorA = await createUser('Educator A', 'EDUCATOR', 'APPROVED')
      const educatorB = await createUser('Educator B', 'EDUCATOR', 'APPROVED')
      const pendingEducator = await createUser('Pending Educator', 'EDUCATOR', 'PENDING')
      const rejectedEducator = await createUser('Rejected Educator', 'EDUCATOR', 'REJECTED')
      const student = await createUser('Student Caller', 'STUDENT', 'NOT_APPLICABLE')
      const admin = await createUser('Admin Caller', 'ADMIN', 'NOT_APPLICABLE')
      const studentA = await createUser('Student A', 'STUDENT', 'NOT_APPLICABLE')
      const studentB = await createUser('Student B', 'STUDENT', 'NOT_APPLICABLE')
      const courseA = await createCourse('Educator A course', educatorA.id)
      const courseB = await createCourse('Educator B course', educatorB.id)
      const enrollments = await Promise.all([
        prisma.enrollment.create({ data: { userId: studentA.id, courseId: courseA.id } }),
        prisma.enrollment.create({ data: { userId: studentB.id, courseId: courseB.id } }),
      ])
      createdEnrollmentIds.push(...enrollments.map(({ id }) => id))

      server = app.listen(0)
      await new Promise<void>((resolve, reject) => {
        server!.once('listening', resolve)
        server!.once('error', reject)
      })
      const address = server.address() as AddressInfo
      const endpoint = `http://127.0.0.1:${address.port}/api/v1/enrollments`
      const tokenFor = (userId: number, role: string) => jwt.sign({ userId, roles: [role] }, process.env.JWT_SECRET!)
      const request = (token?: string) => fetch(endpoint, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      await t.test('approved educator sees only their courses and learners', async () => {
        const response = await request(tokenFor(educatorA.id, 'EDUCATOR'))
        assert.equal(response.status, 200)
        const body = await response.json() as { success: boolean; data: Array<{ user: { name: string; email: string }; course: { id: number } }> }
        assert.equal(body.success, true)
        assert.equal(body.data.length, 1)
        assert.equal(body.data[0].course.id, courseA.id)
        assert.equal(body.data[0].user.name, 'Student A')
        assert.match(body.data[0].user.email, new RegExp(`-${suffix}@example\\.test$`))
        assert.ok(!JSON.stringify(body).includes('Student B'))
        assert.ok(!JSON.stringify(body).includes(`student-b-${suffix}@example.test`))
      })

      await t.test('pending and rejected educators are denied', async () => {
        for (const educator of [pendingEducator, rejectedEducator]) {
          const response = await request(tokenFor(educator.id, 'EDUCATOR'))
          assert.equal(response.status, 403)
        }
      })

      await t.test('students and admins retain the existing role restriction', async () => {
        assert.equal((await request(tokenFor(student.id, 'STUDENT'))).status, 403)
        assert.equal((await request(tokenFor(admin.id, 'ADMIN'))).status, 403)
      })

      await t.test('missing and invalid authentication are rejected', async () => {
        assert.equal((await request()).status, 401)
        assert.equal((await request('not-a-valid-token')).status, 401)
      })
    } catch (error) {
      primaryFailure = error
      throw error
    } finally {
      const cleanupFailures = await runTestCleanup([
        ...(server ? [{
          label: 'close test HTTP server',
          run: () => new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve())),
        }] : []),
        ...(createdEnrollmentIds.length > 0 ? [{
          label: 'delete test enrollments',
          run: () => prisma.enrollment.deleteMany({ where: { id: { in: createdEnrollmentIds } } }),
        }] : []),
        ...(createdCourseIds.length > 0 ? [{
          label: 'delete test courses',
          run: () => prisma.course.deleteMany({ where: { id: { in: createdCourseIds } } }),
        }] : []),
        ...(createdUserIds.length > 0 ? [{
          label: 'delete test users',
          run: () => prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }),
        }] : []),
        { label: 'disconnect test Prisma client', run: () => prisma.$disconnect() },
      ])
      if (cleanupFailures.length > 0) {
        const message = `Test cleanup failed: ${cleanupFailures.join(', ')}`
        if (primaryFailure) console.error(`${message}; the original test failure is preserved.`)
        else throw new Error(message)
      }
    }
  })
}
