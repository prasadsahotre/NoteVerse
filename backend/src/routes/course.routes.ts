import { Router } from 'express'
import prisma from '../lib/prisma.js'
import {
  authenticateToken,
  AuthRequest,
} from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/role.middleware.js'
import { requireApprovedEducator } from '../middleware/approvedEducator.middleware.js'
import { Prisma } from '../generated/prisma/client.js'

const router = Router()

interface DiscoveredCourseRow {
  id: number
  title: string
  description: string | null
  createdAt: Date
  updatedAt: Date
  educator: { id: number; name: string }
  _count: { enrollments: number }
  averageRating: number | null
  reviewCount: number
}

router.get('/', async (req, res) => {
  try {
    const search = String(req.query.q || '').trim()
    const sort = String(req.query.sort || 'newest').toLowerCase()

    const page = Number(req.query.page || 1)
    const limit = Number(req.query.limit || 10)

    const educatorId =
      req.query.educatorId !== undefined
        ? Number(req.query.educatorId)
        : undefined

    if (!Number.isInteger(page) || page < 1) {
      return res.status(400).json({
        success: false,
        message: 'Page must be a positive integer',
      })
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return res.status(400).json({
        success: false,
        message: 'Limit must be between 1 and 50',
      })
    }

    if (educatorId !== undefined && (!Number.isInteger(educatorId) || educatorId < 1))
    {
      return res.status(400).json({
        success: false,
        message: 'Invalid educatorId',
      })
    }

    if (!['newest', 'oldest', 'popular', 'top-rated'].includes(sort)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid sort. Use newest, oldest, popular, or top-rated',
      })
    }

    const where = {
      status: 'PUBLISHED' as const,
      ...(educatorId !== undefined
        ? {
            educatorId,
          }
        : {}),

    ...(search
      ? {
          OR: [
            {
              title: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
            {
              description: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
          ],
        }
      : {}),
  }

    const skip = (page - 1) * limit

    const orderBy = sort === 'oldest'
      ? Prisma.sql`c."createdAt" ASC`
      : sort === 'popular'
        ? Prisma.sql`COALESCE(enrollment_summary."enrollmentCount", 0) DESC`
        : sort === 'top-rated'
          ? Prisma.sql`CASE WHEN COALESCE(review_summary."reviewCount", 0) = 0 THEN 1 ELSE 0 END ASC,
              review_summary."averageRating" DESC NULLS LAST,
              review_summary."reviewCount" DESC,
              c."createdAt" DESC,
              c."id" DESC`
          : Prisma.sql`c."createdAt" DESC`

    const searchFilter = search
      ? Prisma.sql`AND (
          strpos(lower(c."title"), lower(${search})) > 0 OR
          strpos(lower(coalesce(c."description", '')), lower(${search})) > 0
        )`
      : Prisma.empty
    const educatorFilter = educatorId !== undefined
      ? Prisma.sql`AND c."educatorId" = ${educatorId}`
      : Prisma.empty

    const [courses, total] = await Promise.all([
      prisma.$queryRaw<DiscoveredCourseRow[]>`
        SELECT
          c."id",
          c."title",
          c."description",
          c."createdAt",
          c."updatedAt",
          json_build_object('id', educator."id", 'name', educator."name") AS "educator",
          json_build_object('enrollments', COALESCE(enrollment_summary."enrollmentCount", 0)) AS "_count",
          review_summary."averageRating",
          COALESCE(review_summary."reviewCount", 0)::int AS "reviewCount"
        FROM "Course" c
        INNER JOIN "User" educator ON educator."id" = c."educatorId"
        LEFT JOIN (
          SELECT "courseId", COUNT(*)::int AS "enrollmentCount"
          FROM "Enrollment"
          GROUP BY "courseId"
        ) enrollment_summary ON enrollment_summary."courseId" = c."id"
        LEFT JOIN (
          SELECT "courseId", AVG("rating")::float8 AS "averageRating", COUNT(*)::int AS "reviewCount"
          FROM "CourseReview"
          GROUP BY "courseId"
        ) review_summary ON review_summary."courseId" = c."id"
        WHERE c."status" = 'PUBLISHED'
        ${educatorFilter}
        ${searchFilter}
        ORDER BY ${orderBy}
        LIMIT ${limit} OFFSET ${skip}
      `,

      prisma.course.count({
        where,
      }),
    ])

    return res.json({
      success: true,
      data: courses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Failed to discover courses:', error)

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch courses',
    })
  }
})

router.get('/educator/:educatorId', async (req, res) => {
  try {
    const educatorId = Number(req.params.educatorId)

    if (!Number.isInteger(educatorId) || educatorId < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid educator ID',
      })
    }

    const educator = await prisma.user.findUnique({
      where: {
        id: educatorId,
      },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    })

    if (!educator) {
      return res.status(404).json({
        success: false,
        message: 'Educator not found',
      })
    }

    const isEducator = educator.roles.some(
      (userRole) => userRole.role.name === 'EDUCATOR',
    )

    if (!isEducator) {
      return res.status(403).json({
        success: false,
        message: 'User is not an educator',
      })
    }

    const courses = await prisma.course.findMany({
      where: {
        educatorId,
        status: 'PUBLISHED',
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    res.json({
      success: true,
      data: courses,
    })
  } catch (error) {
    console.error("Failed to fetch educator's courses:", error)

    res.status(500).json({
      success: false,
      message: "Failed to fetch educator's courses",
    })
  }
})

router.get(
  '/mine',
  authenticateToken,
  requireRole('EDUCATOR'),
  requireApprovedEducator,
  async (req: AuthRequest, res) => {
    try {
      const courses = await prisma.course.findMany({
        where: {
          educatorId: req.user!.userId,
        },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          updatedAt: 'desc',
        },
      })

      return res.json({
        success: true,
        data: courses,
      })
    } catch (error) {
      console.error("Failed to fetch educator's courses:", error)

      return res.status(500).json({
        success: false,
        message: "Failed to fetch educator's courses",
      })
    }
  },
)

router.get(
  '/:courseId/curriculum',
  authenticateToken,
  requireRole('EDUCATOR'),
  requireApprovedEducator,
  async (req: AuthRequest, res) => {
    try {
      const courseId = Number(req.params.courseId)

      if (!Number.isInteger(courseId) || courseId < 1) {
        return res.status(400).json({
          success: false,
          message: 'Invalid course ID',
        })
      }

      const course = await prisma.course.findUnique({
        where: { id: courseId },
        include: {
          modules: {
            orderBy: { position: 'asc' },
            include: {
              lessons: { orderBy: { position: 'asc' } },
            },
          },
        },
      })

      if (!course) {
        return res.status(404).json({ success: false, message: 'Course not found' })
      }

      if (course.educatorId !== req.user!.userId) {
        return res.status(403).json({
          success: false,
          message: 'You can only view the curriculum for your own courses',
        })
      }

      return res.json({ success: true, data: course })
    } catch (error) {
      console.error('Failed to fetch course curriculum:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to fetch course curriculum',
      })
    }
  },
)

router.get('/:id', async (req, res) => {
  try {
    const courseId = Number(req.params.id)

    if (!Number.isInteger(courseId) || courseId < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid course ID',
      })
    }

    const course = await prisma.course.findFirst({
      where: {
        id: courseId,
        status: 'PUBLISHED',
      },
      select: {
        id: true,
        title: true,
        description: true,
        educatorId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        modules: {
          orderBy: {
            position: 'asc',
          },
          select: {
            id: true,
            title: true,
            position: true,
            courseId: true,
            createdAt: true,
            updatedAt: true,
            lessons: {
              orderBy: {
                position: 'asc',
              },
              select: {
                id: true,
                title: true,
                content: true,
                position: true,
                moduleId: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    })

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      })
    }

    res.json({
      success: true,
      data: course,
    })
  } catch (error) {
    console.error('Failed to fetch course:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to fetch course',
    })
  }
})

router.post(
  '/',
  authenticateToken,
  requireRole('EDUCATOR'),
  requireApprovedEducator,
  async (req: AuthRequest, res) => {
    try {
      const { title, description } = req.body

      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Title is required',
        })
      }

      if (
        description !== undefined &&
        description !== null &&
        typeof description !== 'string'
      ) {
        return res.status(400).json({
          success: false,
          message: 'Description must be a string',
        })
      }

      const educatorId = req.user!.userId

      const educator = await prisma.user.findUnique({
        where: {
          id: Number(educatorId),
        },
      })

      if (!educator) {
        return res.status(404).json({
          success: false,
          message: 'Educator not found',
        })
      }

      const course = await prisma.course.create({
        data: {
          title: title.trim(),
          description:
            typeof description === 'string' ? description.trim() : description,
          educatorId: Number(educatorId),
        },
      })

      res.status(201).json({
        success: true,
        message: 'Course created successfully',
        data: course,
      })
    } catch (error) {
      console.error('Failed to create course:', error)

      res.status(500).json({
        success: false,
        message: 'Failed to create course',
      })
    }
  },
)

router.patch(
  '/:id',
  authenticateToken,
  requireRole('EDUCATOR'),
  requireApprovedEducator,
  async (req: AuthRequest, res) => {
    try {
      const courseId = Number(req.params.id)
      const { title, description } = req.body

      if (!Number.isInteger(courseId) || courseId < 1) {
        return res.status(400).json({
          success: false,
          message: 'Invalid course ID',
        })
      }

      if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Title must be a non-empty string',
        })
      }

      if (
        description !== undefined &&
        description !== null &&
        typeof description !== 'string'
      ) {
        return res.status(400).json({
          success: false,
          message: 'Description must be a string',
        })
      }

      const educatorId = req.user!.userId

      const existingCourse = await prisma.course.findUnique({
        where: {
          id: courseId,
        },
      })

      if (!existingCourse) {
        return res.status(404).json({
          success: false,
          message: 'Course not found',
        })
      }

      if (existingCourse.educatorId !== educatorId) {
        return res.status(403).json({
          success: false,
          message: 'You can only update your own course',
        })
      }

      if (!title && description === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Nothing to update',
        })
      }

      const updatedCourse = await prisma.course.update({
        where: {
          id: courseId,
        },
        data: {
          ...(title !== undefined && { title: title.trim() }),
          ...(description !== undefined && {
            description:
              typeof description === 'string'
                ? description.trim()
                : description,
          }),
        },
      })

      res.json({
        success: true,
        message: 'Course updated successfully',
        data: updatedCourse,
      })
    } catch (error) {
      console.error('Failed to update course:', error)

      res.status(500).json({
        success: false,
        message: 'Failed to update course',
      })
    }
  },
)

router.patch(
  '/:id/publish',
  authenticateToken,
  requireRole('EDUCATOR'),
  requireApprovedEducator,
  async (req: AuthRequest, res) => {
    try {
      const courseId = Number(req.params.id)

      if (!Number.isInteger(courseId) || courseId < 1) {
        return res.status(400).json({
          success: false,
          message: 'Invalid course ID',
        })
      }

      const educatorId = req.user!.userId

      const existingCourse = await prisma.course.findUnique({
        where: {
          id: courseId,
        },
      })

      if (!existingCourse) {
        return res.status(404).json({
          success: false,
          message: 'Course not found',
        })
      }

      if (existingCourse.educatorId !== educatorId) {
        return res.status(403).json({
          success: false,
          message: 'You can only publish your own course',
        })
      }

      if (existingCourse.status === 'PUBLISHED') {
        return res.status(400).json({
          success: false,
          message: 'Course is already published',
        })
      }

      const publishedCourse = await prisma.course.update({
        where: {
          id: courseId,
        },
        data: {
          status: 'PUBLISHED',
        },
      })

      res.json({
        success: true,
        message: 'Course published successfully',
        data: publishedCourse,
      })
    } catch (error) {
      console.error('Failed to publish course:', error)

      res.status(500).json({
        success: false,
        message: 'Failed to publish course',
      })
    }
  },
)

router.patch(
  '/:id/unpublish',
  authenticateToken,
  requireRole('EDUCATOR'),
  requireApprovedEducator,
  async (req: AuthRequest, res) => {
    try {
      const courseId = Number(req.params.id)

      if (!Number.isInteger(courseId) || courseId < 1) {
        return res.status(400).json({
          success: false,
          message: 'Invalid course ID',
        })
      }

      const existingCourse = await prisma.course.findUnique({
        where: { id: courseId },
      })

      if (!existingCourse) {
        return res.status(404).json({
          success: false,
          message: 'Course not found',
        })
      }

      if (existingCourse.educatorId !== req.user!.userId) {
        return res.status(403).json({
          success: false,
          message: 'You can only unpublish your own course',
        })
      }

      if (existingCourse.status !== 'PUBLISHED') {
        return res.status(400).json({
          success: false,
          message: 'Course is already a draft',
        })
      }

      const course = await prisma.course.update({
        where: { id: courseId },
        data: { status: 'DRAFT' },
      })

      return res.json({
        success: true,
        message: 'Course unpublished successfully',
        data: course,
      })
    } catch (error) {
      console.error('Failed to unpublish course:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to unpublish course',
      })
    }
  },
)

router.delete(
  '/:id',
  authenticateToken,
  requireRole('EDUCATOR'),
  requireApprovedEducator,
  async (req: AuthRequest, res) => {
    try {
      const courseId = Number(req.params.id)

      if (!Number.isInteger(courseId) || courseId < 1) {
        return res.status(400).json({
          success: false,
          message: 'Invalid course ID',
        })
      }

      const educatorId = req.user!.userId

      const result = await prisma.$transaction(
        async (transaction) => {
          const course = await transaction.course.findUnique({
            where: { id: courseId },
            select: {
              id: true,
              educatorId: true,
              _count: {
                select: {
                  modules: true,
                  enrollments: true,
                  reviews: true,
                  certificates: true,
                  reports: true,
                },
              },
            },
          })

          if (!course) return 'not-found' as const
          if (course.educatorId !== educatorId) return 'forbidden' as const

          const hasRelatedData = Object.values(course._count).some((count) => count > 0)
          if (hasRelatedData) return 'has-related-data' as const

          await transaction.course.delete({ where: { id: courseId } })
          return 'deleted' as const
        },
        { isolationLevel: 'Serializable' },
      )

      if (result === 'not-found') {
        return res.status(404).json({ success: false, message: 'Course not found' })
      }
      if (result === 'forbidden') {
        return res.status(403).json({
          success: false,
          message: 'You can only delete your own course',
        })
      }
      if (result === 'has-related-data') {
        return res.status(409).json({
          success: false,
          message: 'This course has content or related records and cannot be deleted. Unpublish it instead.',
        })
      }

      return res.json({ success: true, message: 'Course deleted successfully' })
    } catch (error) {
      console.error('Failed to delete course:', error)

      res.status(500).json({
        success: false,
        message: 'Failed to delete course',
      })
    }
  },
)

export default router
