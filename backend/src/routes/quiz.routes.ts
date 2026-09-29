import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

router.post('/', async (req, res) => {
  try {
    const { title, lessonId, educatorId } = req.body

    if (!title || !lessonId || !educatorId) {
      return res.status(400).json({
        success: false,
        message: 'Title, lessonId and educatorId are required',
      })
    }

    const lesson = await prisma.lesson.findUnique({
      where: {
        id: Number(lessonId),
      },
      include: {
        module: {
          include: {
            course: true,
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

    if (lesson.module.course.educatorId !== Number(educatorId)) {
      return res.status(403).json({
        success: false,
        message: 'You can only create quizzes for your own courses',
      })
    }

    const quiz = await prisma.quiz.create({
      data: {
        title: title.trim(),
        lessonId: Number(lessonId),
      },
    })

    res.status(201).json({
      success: true,
      message: 'Quiz created successfully',
      data: quiz,
    })
  } catch (error) {
    console.error('Failed to create quiz:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to create quiz',
    })
  }
})

router.post('/questions', async (req, res) => {
  try {
    const { quizId, question, options, educatorId } = req.body

    if (!quizId || !question || !Array.isArray(options) || !educatorId) {
      return res.status(400).json({
        success: false,
        message: 'quizId, question, options and educatorId are required',
      })
    }

    if (options.length !== 4) {
      return res.status(400).json({
        success: false,
        message: 'Exactly 4 options are required',
      })
    }

    const correctOptions = options.filter(
      (option: { isCorrect: boolean }) => option.isCorrect === true
    )

    if (correctOptions.length !== 1) {
      return res.status(400).json({
        success: false,
        message: 'Exactly one option must be correct',
      })
    }

    const quiz = await prisma.quiz.findUnique({
      where: {
        id: Number(quizId),
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

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found',
      })
    }

    if (quiz.lesson.module.course.educatorId !== Number(educatorId)) {
      return res.status(403).json({
        success: false,
        message: 'You can only add questions to quizzes in your own courses',
      })
    }

    const createdQuestion = await prisma.question.create({
      data: {
        question: question.trim(),
        quizId: Number(quizId),
        options: {
          create: options.map(
            (option: { text: string; isCorrect: boolean }) => ({
              text: option.text.trim(),
              isCorrect: option.isCorrect,
            })
          ),
        },
      },
      include: {
        options: true,
      },
    })

    res.status(201).json({
      success: true,
      message: 'Question created successfully',
      data: createdQuestion,
    })
  } catch (error) {
    console.error('Failed to create question:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to create question',
    })
  }
})

router.get('/attempts/user/:userId', async (req, res) => {
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

    const attempts = await prisma.quizAttempt.findMany({
      where: {
        userId,
      },
      orderBy: {
        attemptedAt: 'desc',
      },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            lesson: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
    })

    res.json({
      success: true,
      data: attempts,
    })
  } catch (error) {
    console.error('Failed to fetch quiz attempts:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to fetch quiz attempts',
    })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const quizId = Number(req.params.id)

    if (Number.isNaN(quizId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid quiz ID',
      })
    }

    const quiz = await prisma.quiz.findUnique({
      where: {
        id: quizId,
      },
      include: {
        lesson: {
          select: {
            id: true,
            title: true,
          },
        },
        questions: {
          orderBy: {
            id: 'asc',
          },
          select: {
            id: true,
            question: true,
            options: {
              orderBy: {
                id: 'asc',
              },
              select: {
                id: true,
                text: true,
              },
            },
          },
        },
      },
    })

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found',
      })
    }

    res.json({
      success: true,
      data: quiz,
    })
  } catch (error) {
    console.error('Failed to fetch quiz:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to fetch quiz',
    })
  }
})

router.post('/:id/submit', async (req, res) => {
  try {
    const quizId = Number(req.params.id)
    const { userId, answers } = req.body

    if (Number.isNaN(quizId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid quiz ID',
      })
    }

    if (!userId || !Array.isArray(answers)) {
      return res.status(400).json({
        success: false,
        message: 'userId and answers are required',
      })
    }

    const quiz = await prisma.quiz.findUnique({
      where: {
        id: quizId,
      },
      include: {
        lesson: {
          include: {
            module: {
              select: {
                courseId: true,
              },
            },
          },
        },
        questions: {
          include: {
            options: true,
          },
        },
      },
    })

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found',
      })
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId: Number(userId),
          courseId: quiz.lesson.module.courseId,
        },
      },
    })

if (!enrollment) {
  return res.status(403).json({
    success: false,
    message: 'Student is not enrolled in this course',
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

    let correctAnswers = 0

    for (const answer of answers) {
      const question = quiz.questions.find(
        (item) => item.id === Number(answer.questionId)
      )

      if (!question) {
        continue
      }

      const selectedOption = question.options.find(
        (option) => option.id === Number(answer.optionId)
      )

      if (selectedOption?.isCorrect) {
        correctAnswers++
      }
    }

    const totalQuestions = quiz.questions.length

    const score =
    totalQuestions === 0
        ? 0
        : Math.round((correctAnswers / totalQuestions) * 100)

    const attempt = await prisma.quizAttempt.create({
    data: {
        userId: Number(userId),
        quizId,
        totalQuestions,
        correctAnswers,
        score,
    },
    })

    res.json({
    success: true,
    message: 'Quiz submitted successfully',
    data: {
        attemptId: attempt.id,
        quizId,
        totalQuestions,
        correctAnswers,
        score,
        attemptedAt: attempt.attemptedAt,
    },
    })
  } catch (error) {
    console.error('Failed to submit quiz:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to submit quiz',
    })
  }
})

export default router