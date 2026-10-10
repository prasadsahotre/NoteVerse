import 'dotenv/config'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import jwt from 'jsonwebtoken'

const testDatabaseUrl = process.env.DATABASE_URL_TEST

if (!testDatabaseUrl) {
  test('course review routes', { skip: 'Set DATABASE_URL_TEST to a dedicated migrated test database.' }, () => {})
} else if (!new URL(testDatabaseUrl).pathname.toLowerCase().includes('test')) {
  test('course review routes', { skip: 'DATABASE_URL_TEST database name must include "test" to protect real data.' }, () => {})
} else {
  test('course review routes validate publication, enrollment, ownership, and duplicates', async (t) => {
    process.env.DATABASE_URL = testDatabaseUrl
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'noteverse-course-review-test-secret'

    const [{ default: prisma }, { default: app }] = await Promise.all([
      import('../lib/prisma.js'),
      import('../app.js'),
    ])

    const suffix = randomUUID()
    const createdUserIds: number[] = []
    const createdCourseIds: number[] = []
    const createdReviewIds: number[] = []
    const createdEnrollmentIds: number[] = []
    let server: ReturnType<typeof app.listen> | undefined

    try {
      const roles = await prisma.role.findMany({ where: { name: { in: ['STUDENT', 'EDUCATOR'] } } })
      const roleIds = new Map(roles.map((role) => [role.name, role.id]))
      assert.ok(roleIds.has('STUDENT'), 'STUDENT role must be seeded')
      assert.ok(roleIds.has('EDUCATOR'), 'EDUCATOR role must be seeded')

      const createUser = async (name: string, role: 'STUDENT' | 'EDUCATOR') => {
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

      const owner = await createUser('Review Course Owner', 'EDUCATOR')
      const student = await createUser('Review Student', 'STUDENT')
      const otherStudent = await createUser('Other Review Student', 'STUDENT')
      const createCourse = async (title: string, status: 'PUBLISHED' | 'DRAFT') => {
        const course = await prisma.course.create({
          data: { title: `${title} ${suffix}`, educatorId: owner.id, status },
        })
        createdCourseIds.push(course.id)
        return course
      }
      const publishedCourse = await createCourse('Published review course', 'PUBLISHED')
      const draftCourse = await createCourse('Draft review course', 'DRAFT')
      const duplicateCourse = await createCourse('Duplicate review course', 'PUBLISHED')
      const enrollStudent = async (courseId: number) => {
        const enrollment = await prisma.enrollment.create({ data: { userId: student.id, courseId } })
        createdEnrollmentIds.push(enrollment.id)
      }
      await enrollStudent(publishedCourse.id)
      await enrollStudent(draftCourse.id)
      await enrollStudent(duplicateCourse.id)

      const publishedReview = await prisma.courseReview.create({
        data: { userId: otherStudent.id, courseId: publishedCourse.id, rating: 4, review: 'Clear and useful.' },
      })
      createdReviewIds.push(publishedReview.id)
      const draftReview = await prisma.courseReview.create({
        data: { userId: otherStudent.id, courseId: draftCourse.id, rating: 1, review: 'Not public.' },
      })
      createdReviewIds.push(draftReview.id)
      const studentDraftReview = await prisma.courseReview.create({
        data: { userId: student.id, courseId: draftCourse.id, rating: 5, review: 'Private student result.' },
      })
      createdReviewIds.push(studentDraftReview.id)

      server = app.listen(0)
      await new Promise<void>((resolve, reject) => {
        server!.once('listening', resolve)
        server!.once('error', reject)
      })
      const address = server.address() as AddressInfo
      const baseUrl = `http://127.0.0.1:${address.port}/api/v1/course-reviews`
      const tokenFor = (userId: number) => jwt.sign({ userId, roles: ['STUDENT'] }, process.env.JWT_SECRET!)
      const studentToken = tokenFor(student.id)
      const otherStudentToken = tokenFor(otherStudent.id)
      const request = (path: string, token?: string, method = 'GET', body?: unknown) =>
        fetch(`${baseUrl}${path}`, {
          method,
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        })

      await t.test('published course listing returns the established review summary', async () => {
        const response = await request(`/course/${publishedCourse.id}`)
        assert.equal(response.status, 200)
        const body = await response.json() as {
          success: boolean
          data: { courseId: number; totalReviews: number; averageRating: number; reviews: Array<{ id: number; rating: number; review: string; user: { id: number; name: string } }> }
        }
        assert.equal(body.success, true)
        assert.equal(body.data.courseId, publishedCourse.id)
        assert.equal(body.data.totalReviews, 1)
        assert.equal(body.data.averageRating, 4)
        assert.equal(body.data.reviews[0].id, publishedReview.id)
        assert.equal(body.data.reviews[0].review, 'Clear and useful.')
        assert.equal(body.data.reviews[0].user.id, otherStudent.id)
        assert.equal(body.data.reviews[0].user.name, otherStudent.name)
      })

      await t.test('enrolled students can read only their own review on published and unpublished courses', async () => {
        const publishedMine = await request(`/course/${publishedCourse.id}/mine`, studentToken)
        assert.equal(publishedMine.status, 200)
        assert.deepEqual(await publishedMine.json(), { success: true, data: null })

        const unpublishedMine = await request(`/course/${draftCourse.id}/mine`, studentToken)
        assert.equal(unpublishedMine.status, 200)
        const unpublishedBody = await unpublishedMine.json() as {
          success: boolean
          data: { id: number; userId: number; courseId: number; rating: number; review: string }
        }
        assert.equal(unpublishedBody.success, true)
        assert.equal(unpublishedBody.data.id, studentDraftReview.id)
        assert.equal(unpublishedBody.data.userId, student.id)
        assert.equal(unpublishedBody.data.courseId, draftCourse.id)
        assert.equal(unpublishedBody.data.review, 'Private student result.')
        assert.equal('reviews' in unpublishedBody.data, false)
        assert.equal('averageRating' in unpublishedBody.data, false)

        assert.equal((await request(`/course/${publishedCourse.id}/mine`, otherStudentToken)).status, 403)
        assert.equal((await request(`/course/${publishedCourse.id}/mine`)).status, 401)
        assert.equal((await request('/course/999999999/mine', studentToken)).status, 404)
      })

      await t.test('draft, missing, and invalid course IDs are not listed', async () => {
        for (const id of [String(draftCourse.id), '999999999']) {
          const response = await request(`/course/${id}`)
          assert.equal(response.status, 404)
          assert.equal((await response.json() as { message: string }).message, 'Course not found')
        }
        for (const id of ['not-an-id', '1.5', '0', '-1']) {
          assert.equal((await request(`/course/${id}`)).status, 400)
          assert.equal((await request('/', studentToken, 'POST', { courseId: id, rating: 4 })).status, 400)
        }
      })

      await t.test('enrolled students can create reviews and duplicate submissions return 409', async () => {
        const created = await request('/', studentToken, 'POST', {
          courseId: publishedCourse.id,
          rating: 5,
          review: '  Excellent lessons.  ',
        })
        assert.equal(created.status, 201)
        const body = await created.json() as { success: boolean; message: string; data: { id: number; courseId: number; userId: number; rating: number; review: string } }
        assert.equal(body.success, true)
        assert.equal(body.message, 'Course review created successfully')
        assert.equal(body.data.courseId, publishedCourse.id)
        assert.equal(body.data.userId, student.id)
        assert.equal(body.data.rating, 5)
        assert.equal(body.data.review, 'Excellent lessons.')
        createdReviewIds.push(body.data.id)

        const duplicate = await request('/', studentToken, 'POST', {
          courseId: publishedCourse.id,
          rating: 3,
        })
        assert.equal(duplicate.status, 409)
        assert.equal((await duplicate.json() as { success: boolean }).success, false)

        assert.equal((await request('/', otherStudentToken, 'POST', {
          courseId: publishedCourse.id,
          rating: 5,
        })).status, 403)
        assert.equal((await request('/', studentToken, 'POST', { courseId: publishedCourse.id, rating: 6 })).status, 400)
        assert.equal((await request('/', studentToken, 'POST', { courseId: publishedCourse.id, rating: 4, review: 42 })).status, 400)
      })

      await t.test('review IDs must be positive integers for updates and deletions', async () => {
        for (const id of ['not-an-id', '1.5', '0', '-1']) {
          assert.equal((await request(`/${id}`, studentToken, 'PATCH', { rating: 4 })).status, 400)
          assert.equal((await request(`/${id}`, studentToken, 'DELETE')).status, 400)
        }
        assert.equal((await request('/999999999', studentToken, 'PATCH', { rating: 4 })).status, 404)
        assert.equal((await request('/999999999', studentToken, 'DELETE')).status, 404)
      })

      await t.test('students can edit and delete only their own review', async () => {
        const ownReview = await prisma.courseReview.findUnique({
          where: { userId_courseId: { userId: student.id, courseId: publishedCourse.id } },
        })
        assert.ok(ownReview)
        assert.equal((await request(`/${ownReview.id}`, otherStudentToken, 'PATCH', { rating: 2 })).status, 403)
        assert.equal((await request(`/${ownReview.id}`, otherStudentToken, 'DELETE')).status, 403)

        const updated = await request(`/${ownReview.id}`, studentToken, 'PATCH', { rating: 3, review: 'Updated review.' })
        assert.equal(updated.status, 200)
        const updatedBody = await updated.json() as { success: boolean; message: string; data: { rating: number; review: string } }
        assert.equal(updatedBody.success, true)
        assert.equal(updatedBody.message, 'Course review updated successfully')
        assert.equal(updatedBody.data.rating, 3)
        assert.equal(updatedBody.data.review, 'Updated review.')

        const deleted = await request(`/${ownReview.id}`, studentToken, 'DELETE')
        assert.equal(deleted.status, 200)
        assert.deepEqual(await deleted.json(), { success: true, message: 'Course review deleted successfully' })
        createdReviewIds.splice(createdReviewIds.indexOf(ownReview.id), 1)
      })

      await t.test('Prisma uniqueness conflicts map to HTTP 409', async () => {
        const delegate = prisma.courseReview as unknown as {
          create: (...args: unknown[]) => Promise<unknown>
        }
        const originalCreate = delegate.create
        delegate.create = async () => {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
        }
        try {
          const response = await request('/', studentToken, 'POST', {
            courseId: duplicateCourse.id,
            rating: 4,
          })
          assert.equal(response.status, 409)
          assert.deepEqual(await response.json(), {
            success: false,
            message: 'You have already reviewed this course',
          })
        } finally {
          delegate.create = originalCreate
        }
      })
    } finally {
      if (server) {
        await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()))
      }
      if (createdReviewIds.length > 0) {
        await prisma.courseReview.deleteMany({ where: { id: { in: createdReviewIds } } })
      }
      if (createdEnrollmentIds.length > 0) {
        await prisma.enrollment.deleteMany({ where: { id: { in: createdEnrollmentIds } } })
      }
      if (createdCourseIds.length > 0) {
        await prisma.course.deleteMany({ where: { id: { in: createdCourseIds } } })
      }
      if (createdUserIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
      }
      await prisma.$disconnect()
    }
  })
}
