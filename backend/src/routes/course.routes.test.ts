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
    const createdReviewIds: number[] = []
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
      const secondReviewer = await createUser('Second Review Student', 'STUDENT')
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
      const sortMarker = `ReviewSort-${suffix}`
      const createRatedCourse = async (
        title: string,
        status: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED',
        educatorId = educator.id,
      ) => prisma.course.create({ data: { title: `${sortMarker} ${title}`, educatorId, status } })
      const highestRatedCourse = await createRatedCourse('highest average')
      const tieManyReviewsCourse = await createRatedCourse('same average more reviews')
      const tieFewReviewsCourse = await createRatedCourse('same average fewer reviews')
      const unratedCourse = await createRatedCourse('unrated')
      const draftRatedCourse = await createRatedCourse('unpublished', 'DRAFT')
      const otherEducatorCourse = await createRatedCourse('other educator', 'PUBLISHED', otherEducator.id)
      createdCourseIds.push(
        publishedCourse.id,
        draftCourse.id,
        protectedCourse.id,
        emptyCourse.id,
        highestRatedCourse.id,
        tieManyReviewsCourse.id,
        tieFewReviewsCourse.id,
        unratedCourse.id,
        draftRatedCourse.id,
        otherEducatorCourse.id,
      )

      const createReview = async (userId: number, courseId: number, rating: number) => {
        const review = await prisma.courseReview.create({ data: { userId, courseId, rating } })
        createdReviewIds.push(review.id)
      }
      await createReview(student.id, highestRatedCourse.id, 5)
      await createReview(student.id, tieManyReviewsCourse.id, 5)
      await createReview(secondReviewer.id, tieManyReviewsCourse.id, 3)
      await createReview(student.id, tieFewReviewsCourse.id, 4)
      await createReview(student.id, draftRatedCourse.id, 5)

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

      await t.test('discovery returns real review aggregates and preserves published search and sort behavior', async () => {
        const response = await fetch(
          `${baseUrl}/courses?sort=top-rated&q=${encodeURIComponent(sortMarker)}&educatorId=${educator.id}&limit=10`,
        )
        assert.equal(response.status, 200)
        const body = await response.json() as {
          success: boolean
          data: Array<{
            id: number
            title: string
            description: string | null
            educator: { id: number; name: string }
            _count: { enrollments: number }
            averageRating: number | null
            reviewCount: number
          }>
          pagination: { total: number; totalPages: number }
        }
        assert.equal(body.success, true)
        assert.equal(body.pagination.total, 4)
        assert.deepEqual(body.data.map((course) => course.id), [
          highestRatedCourse.id,
          tieManyReviewsCourse.id,
          tieFewReviewsCourse.id,
          unratedCourse.id,
        ])
        assert.equal(body.data[0].averageRating, 5)
        assert.equal(body.data[0].reviewCount, 1)
        assert.equal(body.data[1].averageRating, 4)
        assert.equal(body.data[1].reviewCount, 2)
        assert.equal(body.data[2].averageRating, 4)
        assert.equal(body.data[2].reviewCount, 1)
        assert.equal(body.data[3].averageRating, null)
        assert.equal(body.data[3].reviewCount, 0)
        assert.equal(body.data[0].educator.id, educator.id)
        assert.equal(body.data[0].educator.name, educator.name)
        assert.ok(body.data[0]._count.enrollments >= 0)
        assert.equal(body.data.some((course) => course.id === draftRatedCourse.id), false)

        const otherEducatorResponse = await fetch(
          `${baseUrl}/courses?sort=top-rated&q=${encodeURIComponent(sortMarker)}&educatorId=${otherEducator.id}&limit=10`,
        )
        const otherEducatorBody = await otherEducatorResponse.json() as {
          data: Array<{ id: number }>
          pagination: { total: number }
        }
        assert.equal(otherEducatorResponse.status, 200)
        assert.equal(otherEducatorBody.pagination.total, 1)
        assert.deepEqual(otherEducatorBody.data.map((course) => course.id), [otherEducatorCourse.id])

        const paginatedResponse = await fetch(
          `${baseUrl}/courses?sort=top-rated&q=${encodeURIComponent(sortMarker)}&educatorId=${educator.id}&page=2&limit=2`,
        )
        const paginatedBody = await paginatedResponse.json() as {
          data: Array<{ id: number }>
          pagination: { page: number; limit: number; total: number; totalPages: number }
        }
        assert.equal(paginatedResponse.status, 200)
        assert.equal(paginatedBody.pagination.page, 2)
        assert.equal(paginatedBody.pagination.limit, 2)
        assert.equal(paginatedBody.pagination.total, 4)
        assert.equal(paginatedBody.pagination.totalPages, 2)
        assert.deepEqual(paginatedBody.data.map((course) => course.id), [
          tieFewReviewsCourse.id,
          unratedCourse.id,
        ])

        const newestResponse = await fetch(
          `${baseUrl}/courses?sort=newest&q=${encodeURIComponent(sortMarker)}&educatorId=${educator.id}&limit=10`,
        )
        const newest = await newestResponse.json() as {
          data: Array<{ id: number; createdAt: string }>
        }
        assert.equal(newestResponse.status, 200)
        assert.equal(newest.data.length, 4)
        for (let index = 1; index < newest.data.length; index += 1) {
          assert.ok(Date.parse(newest.data[index - 1].createdAt) >= Date.parse(newest.data[index].createdAt))
        }
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
      if (createdReviewIds.length > 0) {
        await prisma.courseReview.deleteMany({ where: { id: { in: createdReviewIds } } })
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
