import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

// Ask a question about a lesson
router.post('/', async (req, res) => {
  try {
    const { userId, lessonId, question } = req.body

    if (!userId || !lessonId || !question) {
      return res.status(400).json({
        success: false,
        message: 'userId, lessonId and question are required',
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

    const lessonQuestion = await prisma.lessonQuestion.create({
      data: {
        userId: Number(userId),
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
router.patch('/:id/answer', async (req, res) => {
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
    })

    if (!lessonQuestion) {
      return res.status(404).json({
        success: false,
        message: 'Question not found',
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