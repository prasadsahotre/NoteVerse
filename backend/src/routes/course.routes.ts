import { Router } from 'express'
import prisma from '../lib/prisma.js'
import {
  authenticateToken,
  AuthRequest,
} from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/role.middleware.js'
import { requireApprovedEducator } from '../middleware/approvedEducator.middleware.js'

const router = Router()

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

    if (!['newest', 'oldest', 'popular'].includes(sort)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid sort. Use newest, oldest, or popular',
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

    const orderBy =
      sort === 'oldest'
        ? {
            createdAt: 'asc' as const,
          }
        : sort === 'popular'
          ? {
              enrollments: {
                _count: 'desc' as const,
              },
            }
          : {
              createdAt: 'desc' as const,
            }

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          id: true,
          title: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          educator: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              enrollments: true,
            },
          },
        },
      }),

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
      include: {
        modules: {
          orderBy: {
            position: 'asc',
          },
          include: {
            lessons: {
              orderBy: {
                position: 'asc',
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
