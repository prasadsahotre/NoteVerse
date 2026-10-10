import 'dotenv/config'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import jwt from 'jsonwebtoken'

const testDatabaseUrl = process.env.DATABASE_URL_TEST

if (!testDatabaseUrl) {
  test('educator curriculum ownership and deletion safeguards', { skip: 'Set DATABASE_URL_TEST to a dedicated migrated test database.' }, () => {})
} else if (!new URL(testDatabaseUrl).pathname.toLowerCase().includes('test')) {
  test('educator curriculum ownership and deletion safeguards', { skip: 'DATABASE_URL_TEST database name must include "test" to protect real data.' }, () => {})
} else {
  test('educator curriculum reads and deletes are ownership and data safe', async (t) => {
    process.env.DATABASE_URL = testDatabaseUrl
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'noteverse-curriculum-test-secret'

    const [{ default: prisma }, { default: app }] = await Promise.all([
      import('../lib/prisma.js'),
      import('../app.js'),
    ])

    const suffix = randomUUID()
    const createdUserIds: number[] = []
    let courseId: number | undefined
    let moduleIds: number[] = []
    let lessonIds: number[] = []
    let progressId: number | undefined
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

      const educator = await createUser('Curriculum Owner', 'EDUCATOR', 'APPROVED')
      const otherEducator = await createUser('Other Curriculum Owner', 'EDUCATOR', 'APPROVED')
      const pendingEducator = await createUser('Pending Curriculum Owner', 'EDUCATOR', 'PENDING')
      const student = await createUser('Curriculum Student', 'STUDENT')
      const course = await prisma.course.create({
        data: { title: `Curriculum ${suffix}`, educatorId: educator.id },
      })
      courseId = course.id

      const laterModule = await prisma.module.create({
        data: { title: 'Later module', position: 2, courseId: course.id },
      })
      const earlierModule = await prisma.module.create({
        data: { title: 'Earlier module', position: 1, courseId: course.id },
      })
      const emptyModule = await prisma.module.create({
        data: { title: 'Empty module', position: 3, courseId: course.id },
      })
      moduleIds = [laterModule.id, earlierModule.id, emptyModule.id]

      const laterLesson = await prisma.lesson.create({
        data: { title: 'Later lesson', position: 2, moduleId: earlierModule.id },
      })
      const earlierLesson = await prisma.lesson.create({
        data: { title: 'Earlier lesson', position: 1, moduleId: earlierModule.id },
      })
      const protectedLesson = await prisma.lesson.create({
        data: { title: 'Protected lesson', position: 1, moduleId: laterModule.id },
      })
      const emptyLesson = await prisma.lesson.create({
        data: { title: 'Empty lesson', position: 1, moduleId: laterModule.id },
      })
      lessonIds = [laterLesson.id, earlierLesson.id, protectedLesson.id, emptyLesson.id]
      const progress = await prisma.lessonProgress.create({
        data: { userId: student.id, lessonId: protectedLesson.id, completed: true },
      })
      progressId = progress.id

      server = app.listen(0)
      await new Promise<void>((resolve, reject) => {
        server!.once('listening', resolve)
        server!.once('error', reject)
      })
      const address = server.address() as AddressInfo
      const baseUrl = `http://127.0.0.1:${address.port}/api/v1`
      const tokenFor = (userId: number) => jwt.sign({ userId, roles: ['EDUCATOR'] }, process.env.JWT_SECRET!)
      const ownerToken = tokenFor(educator.id)
      const otherToken = tokenFor(otherEducator.id)
      const pendingToken = tokenFor(pendingEducator.id)
      const request = (path: string, token: string, method = 'GET') =>
        fetch(`${baseUrl}${path}`, {
          method,
          headers: { Authorization: `Bearer ${token}` },
        })

      await t.test('curriculum endpoint is owner and approval scoped and returns ordered nested data', async () => {
        const response = await request(`/courses/${course.id}/curriculum`, ownerToken)
        assert.equal(response.status, 200)
        const body = await response.json() as { data: { modules: Array<{ title: string; lessons: Array<{ title: string }> }> } }
        assert.deepEqual(body.data.modules.map((module) => module.title), ['Earlier module', 'Later module', 'Empty module'])
        assert.deepEqual(body.data.modules[0].lessons.map((lesson) => lesson.title), ['Earlier lesson', 'Later lesson'])
        assert.equal((await request(`/courses/${course.id}/curriculum`, otherToken)).status, 403)
        assert.equal((await request(`/courses/${course.id}/curriculum`, pendingToken)).status, 403)
      })

      await t.test('module with lessons and lesson with progress return conflict', async () => {
        assert.equal((await request(`/modules/${earlierModule.id}`, ownerToken, 'DELETE')).status, 409)
        assert.equal((await request(`/lessons/${protectedLesson.id}`, ownerToken, 'DELETE')).status, 409)
        assert.ok(await prisma.lessonProgress.findUnique({ where: { id: progress.id } }))
      })

      await t.test('empty lesson and module can be deleted', async () => {
        assert.equal((await request(`/lessons/${emptyLesson.id}`, ownerToken, 'DELETE')).status, 200)
        assert.equal((await request(`/modules/${emptyModule.id}`, ownerToken, 'DELETE')).status, 200)
      })
    } finally {
      if (server) {
        await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()))
      }
      if (progressId !== undefined) {
        await prisma.lessonProgress.deleteMany({ where: { id: progressId } })
      }
      if (lessonIds.length > 0) {
        await prisma.lesson.deleteMany({ where: { id: { in: lessonIds } } })
      }
      if (moduleIds.length > 0) {
        await prisma.module.deleteMany({ where: { id: { in: moduleIds } } })
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
