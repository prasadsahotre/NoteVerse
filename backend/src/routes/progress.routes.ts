import { Router } from 'express'
import prisma from '../lib/prisma.js'
import {
  authenticateToken,
  AuthRequest,
} from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/role.middleware.js'

const router = Router()

router.get('/user/:userId',authenticateToken,requireRole('STUDENT'),async (req: AuthRequest, res) => {
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

    res.json({
      success: true,
      data: progress,
    })
  } catch (error) {
    console.error('Failed to fetch lesson progress:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to fetch lesson progress',
    })
  }
})

router.post('/',authenticateToken,requireRole('STUDENT'),async (req: AuthRequest, res) => {
  try {
    const { lessonId } = req.body
    const userId = req.user!.userId

    if (!lessonId) {
      return res.status(400).json({
        success: false,
        message: 'lessonId is required',
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
        id: Number(lessonId),
      },
    })

    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: 'Lesson not found',
      })
    }

    const progress = await prisma.lessonProgress.upsert({
      where: {
        userId_lessonId: {
          userId: userId,
          lessonId: Number(lessonId),
        },
      },
      update: {
        completed: true,
        completedAt: new Date(),
      },
      create: {
        userId: userId,
        lessonId: Number(lessonId),
        completed: true,
        completedAt: new Date(),
      },
    })

    res.status(200).json({
      success: true,
      message: 'Lesson marked as completed',
      data: progress,
    })
  } catch (error) {
    console.error('Failed to update lesson progress:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to update lesson progress',
    })
  }
})

router.get('/user/:userId/course/:courseId',authenticateToken,requireRole('STUDENT'),async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId
    const courseId = Number(req.params.courseId)

    if (Number.isNaN(courseId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID or course ID',
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
      0
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

    res.json({
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

    res.status(500).json({
      success: false,
      message: 'Failed to fetch course progress',
    })
  }
})

export default router