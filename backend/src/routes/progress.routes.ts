import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

router.get('/user/:userId', async (req, res) => {
  try {
    const userId = Number(req.params.userId)

    if (Number.isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID',
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

router.post('/', async (req, res) => {
  try {
    const { userId, lessonId } = req.body

    if (!userId || !lessonId) {
      return res.status(400).json({
        success: false,
        message: 'userId and lessonId are required',
      })
    }

    const user = await prisma.user.findUnique({
      where: {
        id: Number(userId),
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
          userId: Number(userId),
          lessonId: Number(lessonId),
        },
      },
      update: {
        completed: true,
        completedAt: new Date(),
      },
      create: {
        userId: Number(userId),
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

router.get('/user/:userId/course/:courseId', async (req, res) => {
  try {
    const userId = Number(req.params.userId)
    const courseId = Number(req.params.courseId)

    if (Number.isNaN(userId) || Number.isNaN(courseId)) {
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