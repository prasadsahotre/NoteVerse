import { Router } from 'express'
import prisma from '../lib/prisma.js'
import {
  authenticateToken,
  AuthRequest,
} from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/role.middleware.js'
import { requireApprovedEducator } from '../middleware/approvedEducator.middleware.js'
import { parseOptionalYoutubeVideoId } from '../utils/youtube.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const lessons = await prisma.lesson.findMany({
      select: {
        id: true,
        title: true,
        content: true,
        position: true,
        moduleId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        {
          moduleId: 'asc',
        },
        {
          position: 'asc',
        },
      ],
    })

    res.json({
      success: true,
      data: lessons,
    })
  } catch (error) {
    console.error('Failed to fetch lessons:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to fetch lessons',
    })
  }
})

router.post('/',authenticateToken,requireRole('EDUCATOR'),requireApprovedEducator,async (req: AuthRequest, res) => {
  try {
    const { title, content, position, moduleId, youtubeUrl } = req.body

    const parsedYoutubeField = parseOptionalYoutubeVideoId(youtubeUrl)
    if (!parsedYoutubeField.valid) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid YouTube video URL',
      })
    }
    const youtubeVideoId = parsedYoutubeField.videoId ?? null

    if (!title || position === undefined || !moduleId) {
      return res.status(400).json({
        success: false,
        message: 'Title, position and moduleId are required',
      })
    }

    const module = await prisma.module.findUnique({
      where: {
        id: Number(moduleId),
      },
    })

    if (!module) {
      return res.status(404).json({
        success: false,
        message: 'Module not found',
      })
    }

    const educatorId = req.user!.userId

    const course = await prisma.course.findUnique({
      where: {
        id: module.courseId,
      },
    })

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      })
    }

    if (course.educatorId !== educatorId) {
      return res.status(403).json({
        success: false,
        message: 'You can only create lessons in your own course',
      })
    }

    const lesson = await prisma.lesson.create({
      data: {
        title,
        content,
        position: Number(position),
        moduleId: Number(moduleId),
        youtubeVideoId,
      },
    })

    res.status(201).json({
      success: true,
      message: 'Lesson created successfully',
      data: lesson,
    })
  } catch (error) {
    console.error('Failed to create lesson:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to create lesson',
    })
  }
})

router.patch('/:id',authenticateToken,requireRole('EDUCATOR'),requireApprovedEducator,async (req: AuthRequest, res) => {
  try {
    const lessonId = Number(req.params.id)
    const { title, content, position, youtubeUrl } = req.body
    const parsedYoutubeField = parseOptionalYoutubeVideoId(youtubeUrl)
    if (!parsedYoutubeField.valid) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid YouTube video URL',
      })
    }
    const youtubeVideoId = parsedYoutubeField.provided
      ? parsedYoutubeField.videoId ?? null
      : undefined

    if (Number.isNaN(lessonId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid lesson ID',
      })
    }

    const existingLesson = await prisma.lesson.findUnique({
      where: {
        id: lessonId,
      },
      include: {
        module: {
          include: {
            course: true,
          },
        },
      },
    })

    if (!existingLesson) {
      return res.status(404).json({
        success: false,
        message: 'Lesson not found',
      })
    }

    if (existingLesson.module.course.educatorId !== req.user!.userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update lessons in your own course',
      })
    }

    if (
      title === undefined &&
      content === undefined &&
      position === undefined &&
      youtubeUrl === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: 'Nothing to update',
      })
    }

    const updatedLesson = await prisma.lesson.update({
      where: {
        id: lessonId,
      },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(position !== undefined && { position: Number(position) }),
        ...(youtubeVideoId !== undefined && { youtubeVideoId }),
      },
    })

    res.json({
      success: true,
      message: 'Lesson updated successfully',
      data: updatedLesson,
    })
  } catch (error) {
    console.error('Failed to update lesson:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to update lesson',
    })
  }
})

router.delete('/:id',authenticateToken,requireRole('EDUCATOR'),requireApprovedEducator,async (req: AuthRequest, res) => {
  try {
    const lessonId = Number(req.params.id)

    if (Number.isNaN(lessonId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid lesson ID',
      })
    }

    const result = await prisma.$transaction(
      async (transaction) => {
        const lesson = await transaction.lesson.findUnique({
          where: { id: lessonId },
          include: {
            module: { include: { course: { select: { educatorId: true } } } },
            _count: {
              select: {
                progress: true,
                quizzes: true,
                questions: true,
                resources: true,
                reports: true,
              },
            },
          },
        })

        if (!lesson) return 'not-found' as const
        if (lesson.module.course.educatorId !== req.user!.userId) return 'forbidden' as const

        const quizAttempts = await transaction.quizAttempt.count({
          where: { quiz: { is: { lessonId } } },
        })
        const hasDependents =
          quizAttempts > 0 || Object.values(lesson._count).some((count) => count > 0)
        if (hasDependents) return 'has-dependents' as const

        await transaction.lesson.delete({ where: { id: lessonId } })
        return 'deleted' as const
      },
      { isolationLevel: 'Serializable' },
    )

    if (result === 'not-found') {
      return res.status(404).json({ success: false, message: 'Lesson not found' })
    }
    if (result === 'forbidden') {
      return res.status(403).json({
        success: false,
        message: 'You can only delete lessons in your own course',
      })
    }
    if (result === 'has-dependents') {
      return res.status(409).json({
        success: false,
        message: 'This lesson has progress, quiz attempts or content, learner questions, resources, or reports and cannot be deleted.',
      })
    }

    return res.json({ success: true, message: 'Lesson deleted successfully' })
  } catch (error) {
    console.error('Failed to delete lesson:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to delete lesson',
    })
  }
})

export default router
