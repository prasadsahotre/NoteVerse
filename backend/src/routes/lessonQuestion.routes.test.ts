import 'dotenv/config'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import jwt from 'jsonwebtoken'

const testDatabaseUrl = process.env.DATABASE_URL_TEST

if (!testDatabaseUrl) {
  test('lesson question authorization and answers', { skip: 'Set DATABASE_URL_TEST to a dedicated migrated test database.' }, () => {})
} else if (!new URL(testDatabaseUrl).pathname.toLowerCase().includes('test')) {
  test('lesson question authorization and answers', { skip: 'DATABASE_URL_TEST database name must include "test" to protect real data.' }, () => {})
} else {
  test('lesson questions are enrollment and ownership scoped', async (t) => {
    process.env.DATABASE_URL = testDatabaseUrl
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'noteverse-lesson-question-test-secret'

    const [{ default: prisma }, { default: app }] = await Promise.all([
      import('../lib/prisma.js'),
      import('../app.js'),
    ])

    const suffix = randomUUID()
    const createdUserIds: number[] = []
    let courseId: number | undefined
    let moduleId: number | undefined
    let lessonId: number | undefined
    let enrollmentId: number | undefined
    let server: ReturnType<typeof app.listen> | undefined

    try {
      const roles = await prisma.role.findMany({
        where: { name: { in: ['EDUCATOR', 'STUDENT'] } },
      })
      const roleIds = new Map(roles.map((role) => [role.name, role.id]))
      assert.ok(roleIds.has('EDUCATOR'), 'EDUCATOR role must be seeded')
      assert.ok(roleIds.has('STUDENT'), 'STUDENT role must be seeded')

      const createUser = async (
        name: string,
        role: 'EDUCATOR' | 'STUDENT',
        educatorApprovalStatus: 'APPROVED' | 'NOT_APPLICABLE',
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

      const owner = await createUser('Question Course Owner', 'EDUCATOR', 'APPROVED')
      const unrelatedEducator = await createUser('Unrelated Educator', 'EDUCATOR', 'APPROVED')
      const enrolledStudent = await createUser('Enrolled Question Student', 'STUDENT', 'NOT_APPLICABLE')
      const otherStudent = await createUser('Other Question Student', 'STUDENT', 'NOT_APPLICABLE')

      const course = await prisma.course.create({
        data: { title: `Question Course ${suffix}`, educatorId: owner.id },
      })
      courseId = course.id
      const module = await prisma.module.create({
        data: { title: 'Question Module', position: 1, courseId: course.id },
      })
      moduleId = module.id
      const lesson = await prisma.lesson.create({
        data: { title: 'Question Lesson', position: 1, moduleId: module.id },
      })
      lessonId = lesson.id
      const enrollment = await prisma.enrollment.create({
        data: { userId: enrolledStudent.id, courseId: course.id },
      })
      enrollmentId = enrollment.id

      server = app.listen(0)
      await new Promise<void>((resolve, reject) => {
        server!.once('listening', resolve)
        server!.once('error', reject)
      })
      const address = server.address() as AddressInfo
      const baseUrl = `http://127.0.0.1:${address.port}/api/v1`
      const tokenFor = (userId: number, role: 'EDUCATOR' | 'STUDENT') =>
        jwt.sign({ userId, roles: [role] }, process.env.JWT_SECRET!)
      const ownerToken = tokenFor(owner.id, 'EDUCATOR')
      const educatorToken = tokenFor(unrelatedEducator.id, 'EDUCATOR')
      const studentToken = tokenFor(enrolledStudent.id, 'STUDENT')
      const otherStudentToken = tokenFor(otherStudent.id, 'STUDENT')
      const request = (path: string, token?: string, method = 'GET', body?: unknown) =>
        fetch(`${baseUrl}${path}`, {
          method,
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        })

      await t.test('unauthenticated and unrelated users cannot read lesson questions', async () => {
        assert.equal((await request(`/lesson-questions/lesson/${lesson.id}`)).status, 401)
        assert.equal((await request(`/lesson-questions/lesson/${lesson.id}`, otherStudentToken)).status, 403)
        assert.equal((await request(`/lesson-questions/lesson/${lesson.id}`, educatorToken)).status, 403)
        assert.equal((await request('/lesson-questions/lesson/not-a-number', studentToken)).status, 400)
        assert.equal((await request('/lesson-questions/lesson/999999999', studentToken)).status, 404)
      })

      await t.test('enrolled students can ask and read questions; non-enrolled students cannot', async () => {
        assert.equal((await request('/lesson-questions', undefined, 'POST', {
          lessonId: lesson.id,
          question: 'Can I ask without logging in?',
        })).status, 401)

        const denied = await request('/lesson-questions', otherStudentToken, 'POST', {
          lessonId: lesson.id,
          question: 'I am not enrolled.',
        })
        assert.equal(denied.status, 403)

        const invalid = await request('/lesson-questions', studentToken, 'POST', {
          lessonId: lesson.id,
          question: '   ',
        })
        assert.equal(invalid.status, 400)

        const submitted = await request('/lesson-questions', studentToken, 'POST', {
          lessonId: lesson.id,
          question: '  How should I practice this?  ',
        })
        assert.equal(submitted.status, 201)
        const submittedBody = await submitted.json() as {
          success: boolean
          message: string
          data: { lessonId: number; userId: number; question: string; answer: string | null }
        }
        assert.equal(submittedBody.success, true)
        assert.equal(submittedBody.data.lessonId, lesson.id)
        assert.equal(submittedBody.data.userId, enrolledStudent.id)
        assert.equal(submittedBody.data.question, 'How should I practice this?')
        assert.equal(submittedBody.data.answer, null)

        const studentList = await request(`/lesson-questions/lesson/${lesson.id}`, studentToken)
        assert.equal(studentList.status, 200)
        const studentListBody = await studentList.json() as {
          success: boolean
          data: Array<{ id: number; question: string; user: { id: number; name: string } }>
        }
        assert.equal(studentListBody.success, true)
        assert.equal(studentListBody.data.length, 1)
        assert.equal(studentListBody.data[0].user.id, enrolledStudent.id)
        assert.equal(studentListBody.data[0].user.name, enrolledStudent.name)
        assert.equal((await request(`/lesson-questions/lesson/${lesson.id}`, otherStudentToken)).status, 403)
      })

      await t.test('approved course owner can answer and update answers; other educators cannot', async () => {
        assert.equal((await request('/lesson-questions/not-a-number/answer', ownerToken, 'PATCH', { answer: 'Answer' })).status, 400)
        assert.equal((await request('/lesson-questions/999999999/answer', ownerToken, 'PATCH', { answer: 'Answer' })).status, 404)
        const existing = await prisma.lessonQuestion.findFirst({
          where: { lessonId: lesson.id },
        })
        assert.ok(existing)

        const ownerList = await request(`/lesson-questions/lesson/${lesson.id}`, ownerToken)
        assert.equal(ownerList.status, 200)
        const ownerListBody = await ownerList.json() as {
          success: boolean
          data: Array<{
            id: number
            lessonId: number
            question: string
            answer: string | null
            user: { id: number; name: string }
          }>
        }
        assert.equal(ownerListBody.success, true)
        assert.equal(ownerListBody.data.length, 1)
        assert.equal(ownerListBody.data[0].id, existing.id)
        assert.equal(ownerListBody.data[0].lessonId, lesson.id)
        assert.equal(ownerListBody.data[0].question, 'How should I practice this?')
        assert.equal(ownerListBody.data[0].answer, null)
        assert.equal(ownerListBody.data[0].user.id, enrolledStudent.id)
        assert.equal(ownerListBody.data[0].user.name, enrolledStudent.name)

        for (const answer of ['', '   ', null, 42]) {
          const response = await request(
            `/lesson-questions/${existing.id}/answer`,
            ownerToken,
            'PATCH',
            { answer },
          )
          assert.equal(response.status, 400)
          const body = await response.json() as { success: boolean; message: string }
          assert.equal(body.success, false)
          assert.equal(body.message, 'Answer is required')
        }

        const answered = await request(
          `/lesson-questions/${existing.id}/answer`,
          ownerToken,
          'PATCH',
          { answer: 'Practice slowly with a metronome.' },
        )
        assert.equal(answered.status, 200)
        const answeredBody = await answered.json() as {
          success: boolean
          message: string
          data: { id: number; answer: string; answeredAt: string | null }
        }
        assert.equal(answeredBody.success, true)
        assert.equal(answeredBody.data.answer, 'Practice slowly with a metronome.')
        assert.ok(answeredBody.data.answeredAt)

        const updated = await request(
          `/lesson-questions/${existing.id}/answer`,
          ownerToken,
          'PATCH',
          { answer: 'Start slowly, then increase the tempo.' },
        )
        assert.equal(updated.status, 200)
        const updatedBody = await updated.json() as { data: { answer: string } }
        assert.equal(updatedBody.data.answer, 'Start slowly, then increase the tempo.')

        const forbidden = await request(
          `/lesson-questions/${existing.id}/answer`,
          educatorToken,
          'PATCH',
          { answer: 'Unrelated educator response.' },
        )
        assert.equal(forbidden.status, 403)

        await prisma.user.update({
          where: { id: owner.id },
          data: { educatorApprovalStatus: 'PENDING' },
        })
        try {
          assert.equal((await request(`/lesson-questions/lesson/${lesson.id}`, ownerToken)).status, 403)
          assert.equal((await request(
            `/lesson-questions/${existing.id}/answer`,
            ownerToken,
            'PATCH',
            { answer: 'Pending educators cannot answer.' },
          )).status, 403)
        } finally {
          await prisma.user.update({
            where: { id: owner.id },
            data: { educatorApprovalStatus: 'APPROVED' },
          })
        }
      })
    } finally {
      if (server) {
        await new Promise<void>((resolve, reject) =>
          server!.close((error) => error ? reject(error) : resolve()),
        )
      }
      if (lessonId !== undefined) {
        await prisma.lessonQuestion.deleteMany({ where: { lessonId } })
      }
      if (enrollmentId !== undefined) {
        await prisma.enrollment.deleteMany({ where: { id: enrollmentId } })
      }
      if (lessonId !== undefined) {
        await prisma.lesson.deleteMany({ where: { id: lessonId } })
      }
      if (moduleId !== undefined) {
        await prisma.module.deleteMany({ where: { id: moduleId } })
      }
      if (courseId !== undefined) {
        await prisma.course.deleteMany({ where: { id: courseId } })
      }
      if (createdUserIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } })
      }
      await prisma.$disconnect()
    }
  })
}
