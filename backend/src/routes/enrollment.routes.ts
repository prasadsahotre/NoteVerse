import { Router } from 'express'
import prisma from '../lib/prisma.js'
import {
  authenticateToken,
  AuthRequest,
} from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/role.middleware.js'

const router = Router()

// Get all enrollments - Educator only
router.get(
  '/',
  authenticateToken,
  requireRole('EDUCATOR'),
  async (_req, res) => {
    try {
      const enrollments = await prisma.enrollment.findMany({
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          course: {
            select: {
              id: true,
              title: true,
              description: true,
            },
          },
        },
      })

      res.json({
        success: true,
        data: enrollments,
      })
    } catch (error) {
      console.error('Failed to fetch enrollments:', error)

      res.status(500).json({
        success: false,
        message: 'Failed to fetch enrollments',
      })
    }
  }
)

// Get current student's enrollments
router.get(
  '/user/:userId',
  authenticateToken,
  requireRole('STUDENT'),
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId

      const user = await prisma.user.findUnique({
        where: {
          id: userId,
        },
      })

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        })
      }

      const enrollments = await prisma.enrollment.findMany({
        where: {
          userId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              description: true,
              status: true,
            },
          },
        },
      })

      res.json({
        success: true,
        data: enrollments,
      })
    } catch (error) {
      console.error('Failed to fetch user enrollments:', error)

      res.status(500).json({
        success: false,
        message: 'Failed to fetch user enrollments',
      })
    }
  }
)

// Get a student's enrolled course with modules, lessons and progress
router.get(
  '/user/:userId/course/:courseId',
  authenticateToken,
  requireRole('STUDENT'),
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId
      const courseId = Number(req.params.courseId)

      if (!Number.isInteger(courseId) || courseId < 1) {
        return res.status(400).json({
          success: false,
          message: 'Invalid course ID',
        })
      }

      const user = await prisma.user.findUnique({
        where: {
          id: userId,
        },
      })

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        })
      }

      const enrollment = await prisma.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId,
            courseId,
          },
        },
      })

      if (!enrollment) {
        return res.status(403).json({
          success: false,
          message: 'Student is not enrolled in this course',
        })
      }

      const course = await prisma.course.findUnique({
        where: {
          id: courseId,
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
                include: {
                  quizzes: {
                    select: {
                      id: true,
                      title: true,
                    },
                  },
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

      const progress = await prisma.lessonProgress.findMany({
        where: {
          userId,
          lesson: {
            module: {
              courseId,
            },
          },
        },
        select: {
          lessonId: true,
          completed: true,
        },
      })

      const completedLessonIds = new Set(
        progress
          .filter((item) => item.completed)
          .map((item) => item.lessonId)
      )

      const totalLessons = course.modules.reduce(
        (total, module) => total + module.lessons.length,
        0
      )

      const completedLessons = completedLessonIds.size

      const progressPercentage =
        totalLessons === 0
          ? 0
          : Math.round((completedLessons / totalLessons) * 100)

      const modules = course.modules.map((module) => ({
        id: module.id,
        title: module.title,
        position: module.position,
        lessons: module.lessons.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          content: lesson.content,
          position: lesson.position,
          youtubeVideoId: lesson.youtubeVideoId,
          completed: completedLessonIds.has(lesson.id),
          quizzes: lesson.quizzes,
        })),
      }))

      res.json({
        success: true,
        data: {
          enrollment,
          course: {
            id: course.id,
            title: course.title,
            description: course.description,
            status: course.status,
          },
          progress: {
            totalLessons,
            completedLessons,
            progressPercentage,
          },
          modules,
        },
      })
    } catch (error) {
      console.error('Failed to fetch student course:', error)

      res.status(500).json({
        success: false,
        message: 'Failed to fetch student course',
      })
    }
  }
)

// Create enrollment - Student only
router.post(
  '/',
  authenticateToken,
  requireRole('STUDENT'),
  async (req: AuthRequest, res) => {
    try {
      const { courseId } = req.body

      // Validate courseId exists
      if (
        courseId === undefined ||
        courseId === null ||
        courseId === ''
      ) {
        return res.status(400).json({
          success: false,
          message: 'courseId is required',
        })
      }

      // Validate courseId is a positive integer
      const parsedCourseId = Number(courseId)

      if (
        !Number.isInteger(parsedCourseId) ||
        parsedCourseId < 1
      ) {
        return res.status(400).json({
          success: false,
          message: 'Invalid course ID',
        })
      }

      const userId = req.user!.userId

      // Verify authenticated user exists
      const user = await prisma.user.findUnique({
        where: {
          id: userId,
        },
      })

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        })
      }

      // Verify course exists
      const course = await prisma.course.findUnique({
        where: {
          id: parsedCourseId,
        },
      })

      if (!course) {
        return res.status(404).json({
          success: false,
          message: 'Course not found',
        })
      }

      // Only published courses can be enrolled in
      if (course.status !== 'PUBLISHED') {
        return res.status(400).json({
          success: false,
          message: 'Only published courses can be enrolled in',
        })
      }

      // Create enrollment
      const enrollment = await prisma.enrollment.create({
        data: {
          userId,
          courseId: parsedCourseId,
        },
      })

      res.status(201).json({
        success: true,
        message: 'Enrollment successful',
        data: enrollment,
      })
    } catch (error: any) {
      console.error('Failed to create enrollment:', error)

      if (error?.code === 'P2002') {
        return res.status(409).json({
          success: false,
          message: 'User is already enrolled in this course',
        })
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create enrollment',
      })
    }
  }
)

export default router