import { Router } from 'express'
import prisma from '../lib/prisma.js'
import {
  authenticateToken,
  AuthRequest,
} from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/role.middleware.js'

const router = Router()

// Get all progress for the logged-in student
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

      const progress = await prisma.lessonProgress.findMany({
        where: {
          userId,
        },
        orderBy: {
          updatedAt: 'desc',
        },
        include: {
          lesson: {
            select: {
              id: true,
              title: true,
              position: true,
              moduleId: true,
            },
          },
        },
      })

      return res.json({
        success: true,
        data: progress,
      })
    } catch (error) {
      console.error('Failed to fetch lesson progress:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to fetch lesson progress',
      })
    }
  },
)

// Mark a lesson as completed
router.post(
  '/',
  authenticateToken,
  requireRole('STUDENT'),
  async (req: AuthRequest, res) => {
    try {
      const { lessonId } = req.body
      const userId = req.user!.userId

      if (
        lessonId === undefined ||
        lessonId === null ||
        lessonId === ''
      ) {
        return res.status(400).json({
          success: false,
          message: 'lessonId is required',
        })
      }

      const numericLessonId = Number(lessonId)

      if (!Number.isInteger(numericLessonId) || numericLessonId < 1) {
        return res.status(400).json({
          success: false,
          message: 'lessonId must be a valid positive integer',
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

      const lesson = await prisma.lesson.findUnique({
        where: {
          id: numericLessonId,
        },
        include: {
          module: {
            select: {
              courseId: true,
            },
          },
        },
      })

      if (!lesson) {
        return res.status(404).json({
          success: false,
          message: 'Lesson not found',
        })
      }

      const enrollment = await prisma.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId,
            courseId: lesson.module.courseId,
          },
        },
      })

      if (!enrollment) {
        return res.status(403).json({
          success: false,
          message: 'You must be enrolled in this course to update progress',
        })
      }

      const progress = await prisma.lessonProgress.upsert({
        where: {
          userId_lessonId: {
            userId,
            lessonId: numericLessonId,
          },
        },
        update: {
          completed: true,
          completedAt: new Date(),
        },
        create: {
          userId,
          lessonId: numericLessonId,
          completed: true,
          completedAt: new Date(),
        },
      })

      return res.status(200).json({
        success: true,
        message: 'Lesson marked as completed',
        data: progress,
      })
    } catch (error) {
      console.error('Failed to update lesson progress:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to update lesson progress',
      })
    }
  },
)

// Get progress for a specific course
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
          message: 'You must be enrolled in this course to view progress',
        })
      }

      const course = await prisma.course.findUnique({
        where: {
          id: courseId,
        },
        include: {
          modules: {
            include: {
              lessons: true,
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

      const totalLessons = course.modules.reduce(
        (total, module) => total + module.lessons.length,
        0,
      )

      const completedLessons = await prisma.lessonProgress.count({
        where: {
          userId,
          completed: true,
          lesson: {
            module: {
              courseId,
            },
          },
        },
      })

      const progressPercentage =
        totalLessons === 0
          ? 0
          : Math.round((completedLessons / totalLessons) * 100)

      return res.json({
        success: true,
        data: {
          courseId: course.id,
          courseTitle: course.title,
          totalLessons,
          completedLessons,
          progressPercentage,
        },
      })
    } catch (error) {
      console.error('Failed to fetch course progress:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to fetch course progress',
      })
    }
  },
)

export default router