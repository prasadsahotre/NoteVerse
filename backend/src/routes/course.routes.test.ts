import 'dotenv/config'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import jwt from 'jsonwebtoken'

const testDatabaseUrl = process.env.DATABASE_URL_TEST

if (!testDatabaseUrl) {
  test('educator course status and deletion safety', { skip: 'Set DATABASE_URL_TEST to a dedicated migrated test database.' }, () => {})
} else if (!new URL(testDatabaseUrl).pathname.toLowerCase().includes('test')) {
  test('educator course status and deletion safety', { skip: 'DATABASE_URL_TEST database name must include "test" to protect real data.' }, () => {})
} else {
  test('educator course status transitions preserve student records', async (t) => {
    process.env.DATABASE_URL = testDatabaseUrl
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'noteverse-course-test-secret'

    const [{ default: prisma }, { default: app }] = await Promise.all([
      import('../lib/prisma.js'),
      import('../app.js'),
    ])

    const suffix = randomUUID()
    const createdUserIds: number[] = []
    const createdCourseIds: number[] = []
    let enrolledStudentId: number | undefined
    let certificateIds: number[] = []
    let server: ReturnType<typeof app.listen> | undefined

    try {
      const roles = await prisma.role.findMany({
        where: { name: { in: ['EDUCATOR', 'STUDENT'] } },
      })
      const roleIds = new Map(roles.map((role) => [role.name, role.id]))
      assert.ok(roleIds.has('EDUCATOR'), 'EDUCATOR role must be seeded')
      assert.ok(roleIds.has('STUDENT'), 'STUDENT role must be seeded')

      const createUser = async (name: string, role: 'EDUCATOR' | 'STUDENT') => {
        const user = await prisma.user.create({
          data: {
            name,
            email: `${name.toLowerCase().replaceAll(' ', '-')}-${suffix}@example.test`,
            password: 'test-only-password-hash',
            educatorApprovalStatus: role === 'EDUCATOR' ? 'APPROVED' : 'NOT_APPLICABLE',
            roles: { create: { role: { connect: { id: roleIds.get(role)! } } } },
          },
        })
        createdUserIds.push(user.id)
        return user
      }

      const educator = await createUser('Course Owner', 'EDUCATOR')
      const otherEducator = await createUser('Other Educator', 'EDUCATOR')
      const student = await createUser('Enrolled Student', 'STUDENT')
      enrolledStudentId = student.id

      const publishedCourse = await prisma.course.create({
        data: { title: `Published course ${suffix}`, educatorId: educator.id, status: 'PUBLISHED' },
      })
      const draftCourse = await prisma.course.create({
        data: { title: `Draft course ${suffix}`, educatorId: educator.id },
      })
      const protectedCourse = await prisma.course.create({
        data: { title: `Protected course ${suffix}`, educatorId: educator.id },
      })
      const emptyCourse = await prisma.course.create({
        data: { title: `Empty course ${suffix}`, educatorId: educator.id },
      })
      createdCourseIds.push(publishedCourse.id, draftCourse.id, protectedCourse.id, emptyCourse.id)

      await prisma.enrollment.create({ data: { userId: student.id, courseId: publishedCourse.id } })
      const certificate = await prisma.certificate.create({
        data: {
          certificateNo: `TEST-${suffix}`,
          userId: student.id,
          courseId: publishedCourse.id,
        },
      })
      certificateIds = [certificate.id]
      await prisma.module.create({
        data: { title: `Module ${suffix}`, position: 1, courseId: protectedCourse.id },
      })

      server = app.listen(0)
      await new Promise<void>((resolve, reject) => {
        server!.once('listening', resolve)
        server!.once('error', reject)
      })
      const address = server.address() as AddressInfo
      const baseUrl = `http://127.0.0.1:${address.port}/api/v1`
      const ownerToken = jwt.sign({ userId: educator.id, roles: ['EDUCATOR'] }, process.env.JWT_SECRET!)
      const otherOwnerToken = jwt.sign({ userId: otherEducator.id, roles: ['EDUCATOR'] }, process.env.JWT_SECRET!)
      const studentToken = jwt.sign({ userId: student.id, roles: ['STUDENT'] }, process.env.JWT_SECRET!)
      const request = (path: string, token: string, method = 'GET') =>
        fetch(`${baseUrl}${path}`, {
          method,
          headers: { Authorization: `Bearer ${token}` },
        })

      await t.test('owner can unpublish; discovery hides the course while enrolled learning remains available', async () => {
        const response = await request(`/courses/${publishedCourse.id}/unpublish`, ownerToken, 'PATCH')
        assert.equal(response.status, 200)
        const body = await response.json() as { data: { status: string } }
        assert.equal(body.data.status, 'DRAFT')

        assert.equal((await fetch(`${baseUrl}/courses/${publishedCourse.id}`)).status, 404)
        const enrolledCourse = await request(
          `/enrollments/user/${student.id}/course/${publishedCourse.id}`,
          studentToken,
        )
        assert.equal(enrolledCourse.status, 200)
      })

      await t.test('unpublish rejects wrong owners and invalid state transitions', async () => {
        assert.equal((await request(`/courses/${draftCourse.id}/unpublish`, ownerToken, 'PATCH')).status, 400)
        assert.equal((await request(`/courses/${draftCourse.id}/unpublish`, otherOwnerToken, 'PATCH')).status, 403)
      })

      await t.test('delete refuses courses with learning content or student records and preserves certificates', async () => {
        assert.equal((await request(`/courses/${publishedCourse.id}`, ownerToken, 'DELETE')).status, 409)
        assert.equal((await request(`/courses/${protectedCourse.id}`, ownerToken, 'DELETE')).status, 409)
        assert.ok(await prisma.enrollment.findUnique({
          where: { userId_courseId: { userId: student.id, courseId: publishedCourse.id } },
        }))
        assert.ok(await prisma.certificate.findUnique({ where: { id: certificate.id } }))
      })

      await t.test('delete is ownership checked and permits an empty owned course', async () => {
        assert.equal((await request(`/courses/${emptyCourse.id}`, otherOwnerToken, 'DELETE')).status, 403)
        assert.equal((await request(`/courses/${emptyCourse.id}`, ownerToken, 'DELETE')).status, 200)
      })
    } finally {
      if (server) {
        await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()))
      }
      if (certificateIds.length > 0) {
        await prisma.certificate.deleteMany({ where: { id: { in: certificateIds } } })
      }
      if (enrolledStudentId !== undefined && createdCourseIds.length > 0) {
        await prisma.enrollment.deleteMany({
          where: { userId: enrolledStudentId, courseId: { in: createdCourseIds } },
        })
      }
      if (createdCourseIds.length > 0) {
        await prisma.module.deleteMany({ where: { courseId: { in: createdCourseIds } } })
        await prisma.course.deleteMany({ where: { id: { in: createdCourseIds } } })
      }
      if (createdUserIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
      }
      await prisma.$disconnect()
    }
  })
}
