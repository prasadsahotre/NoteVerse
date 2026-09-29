import { Router } from 'express'
import prisma from '../lib/prisma.js'
import {
  authenticateToken,
  AuthRequest,
} from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/role.middleware.js'

const router = Router()

// Ask a question about a lesson
router.post('/',authenticateToken,requireRole('STUDENT'),async (req: AuthRequest, res) => {
  try {
    const { lessonId, question } = req.body
    const userId = req.user!.userId

    if (!lessonId || !question) {
      return res.status(400).json({
        success: false,
        message: 'lessonId and question are required',
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

    const lessonQuestion = await prisma.lessonQuestion.create({
      data: {
        userId: userId,
        lessonId: Number(lessonId),
        question: question.trim(),
      },
    })

    res.status(201).json({
      success: true,
      message: 'Question asked successfully',
      data: lessonQuestion,
    })
  } catch (error) {
    console.error('Failed to create lesson question:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to ask question',
    })
  }
})

// Answer a lesson question
router.patch('/:id/answer',authenticateToken,requireRole('EDUCATOR'),async (req: AuthRequest, res) => {
  try {
    const questionId = Number(req.params.id)
    const { answer } = req.body

    if (Number.isNaN(questionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid question ID',
      })
    }

    if (!answer) {
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
router.get('/lesson/:lessonId', async (req, res) => {
  try {
    const lessonId = Number(req.params.lessonId)

    if (Number.isNaN(lessonId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid lesson ID',
      })
    }

    const lesson = await prisma.lesson.findUnique({
      where: {
        id: lessonId,
      },
    })

    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: 'Lesson not found',
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
            email: true,
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