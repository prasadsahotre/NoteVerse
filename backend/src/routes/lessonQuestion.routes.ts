import { Router } from 'express'
import prisma from '../lib/prisma.js'
import {
  authenticateToken,
  AuthRequest,
} from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/role.middleware.js'
import { requireApprovedEducator } from '../middleware/approvedEducator.middleware.js'

const router = Router()

// Ask a question about a lesson
router.post('/',authenticateToken,requireRole('STUDENT'),async (req: AuthRequest, res) => {
    try {
      const { lessonId, question } = req.body
      const userId = req.user!.userId

      const parsedLessonId = Number(lessonId)

      if (!Number.isInteger(parsedLessonId) || parsedLessonId < 1) {
        return res.status(400).json({
          success: false,
          message: 'Invalid lesson ID',
        })
      }

      if (typeof question !== 'string' || !question.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Question is required',
        })
      }

      const lesson = await prisma.lesson.findUnique({
        where: {
          id: parsedLessonId,
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
          message: 'You must be enrolled in this course to ask a question',
        })
      }

      const lessonQuestion = await prisma.lessonQuestion.create({
        data: {
          userId,
          lessonId: parsedLessonId,
          question: question.trim(),
        },
      })

      return res.status(201).json({
        success: true,
        message: 'Question asked successfully',
        data: lessonQuestion,
      })
    } catch (error) {
      console.error('Failed to create lesson question:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to ask question',
      })
    }
  },
)

// Answer a lesson question
router.patch('/:id/answer',authenticateToken,requireRole('EDUCATOR'),requireApprovedEducator,async (req: AuthRequest, res) => {
  try {
    const questionId = Number(req.params.id)
    const { answer } = req.body

    if (!Number.isInteger(questionId) || questionId < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid question ID',
      })
    }

    if (typeof answer !== 'string' || !answer.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Answer is required',
      })
    }

    const lessonQuestion = await prisma.lessonQuestion.findUnique({
      where: {
        id: questionId,
      },
      include: {
        lesson: {
          include: {
            module: {
              include: {
                course: true,
              },
            },
          },
        },
      },
    })

    if (!lessonQuestion) {
      return res.status(404).json({
        success: false,
        message: 'Question not found',
      })
    }

    if (
      lessonQuestion.lesson.module.course.educatorId !==
      req.user!.userId
    ) {
      return res.status(403).json({
        success: false,
        message: 'You can only answer questions in your own courses',
      })
    }

    const updatedQuestion = await prisma.lessonQuestion.update({
      where: {
        id: questionId,
      },
      data: {
        answer: answer.trim(),
        answeredAt: new Date(),
      },
    })

    res.json({
      success: true,
      message: 'Question answered successfully',
      data: updatedQuestion,
    })
  } catch (error) {
    console.error('Failed to answer lesson question:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to answer question',
    })
  }
})

// Get all questions for a lesson
router.get('/lesson/:lessonId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const lessonId = Number(req.params.lessonId)

    if (!Number.isInteger(lessonId) || lessonId < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid lesson ID',
      })
    }

    const lesson = await prisma.lesson.findUnique({
      where: {
        id: lessonId,
      },
      include: {
        module: {
          select: {
            courseId: true,
            course: {
              select: {
                educatorId: true,
              },
            },
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

    const userId = req.user!.userId
    const roles = req.user!.roles
    let canReadQuestions = false

    if (roles.includes('STUDENT')) {
      const enrollment = await prisma.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId,
            courseId: lesson.module.courseId,
          },
        },
        select: { id: true },
      })
      canReadQuestions = Boolean(enrollment)
    }

    if (
      !canReadQuestions &&
      roles.includes('EDUCATOR') &&
      lesson.module.course.educatorId === userId
    ) {
      const educator = await prisma.user.findUnique({
        where: { id: userId },
        select: { educatorApprovalStatus: true },
      })
      canReadQuestions = educator?.educatorApprovalStatus === 'APPROVED'
    }

    if (!canReadQuestions) {
      return res.status(403).json({
        success: false,
        message: 'You must be enrolled in this course or be its approved educator to view questions',
      })
    }

    const questions = await prisma.lessonQuestion.findMany({
      where: {
        lessonId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    res.json({
      success: true,
      data: questions,
    })
  } catch (error) {
    console.error('Failed to fetch lesson questions:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to fetch lesson questions',
    })
  }
})

export default router
