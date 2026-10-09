import { Router } from 'express'

import prisma from '../lib/prisma.js'

import {
  authenticateToken,
  AuthRequest,
} from '../middleware/auth.middleware.js'

import { requireRole } from '../middleware/role.middleware.js'
import { requireApprovedEducator } from '../middleware/approvedEducator.middleware.js'

const router = Router()

// Create a quiz

router.post(
  '/',
  authenticateToken,
  requireRole('EDUCATOR'),
  requireApprovedEducator,
  async (req: AuthRequest, res) => {
    try {
      const { title, lessonId } = req.body

      // Validate title
      if (
        typeof title !== 'string' ||
        !title.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: 'Title is required',
        })
      }

      // Validate lessonId is provided
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

      // Validate lessonId
      const parsedLessonId = Number(lessonId)

      if (
        !Number.isInteger(parsedLessonId) ||
        parsedLessonId < 1
      ) {
        return res.status(400).json({
          success: false,
          message: 'Invalid lesson ID',
        })
      }

      // Find lesson and its course
      const lesson = await prisma.lesson.findUnique({
        where: {
          id: parsedLessonId,
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

      // Verify educator owns the course
      const educatorId = req.user!.userId

      if (
        lesson.module.course.educatorId !==
        Number(educatorId)
      ) {
        return res.status(403).json({
          success: false,
          message: 'You can only create quizzes for your own courses',
        })
      }

      // Create quiz
      const quiz = await prisma.quiz.create({
        data: {
          title: title.trim(),
          lessonId: parsedLessonId,
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
  },
)

// Add question to a quiz

router.post(
  '/questions',
  authenticateToken,
  requireRole('EDUCATOR'),
  requireApprovedEducator,
  async (req: AuthRequest, res) => {
    try {
      const { quizId, question, options } = req.body

      // Validate quizId is provided
      if (
        quizId === undefined ||
        quizId === null ||
        quizId === ''
      ) {
        return res.status(400).json({
          success: false,
          message: 'quizId is required',
        })
      }

      // Validate quizId
      const parsedQuizId = Number(quizId)

      if (
        !Number.isInteger(parsedQuizId) ||
        parsedQuizId < 1
      ) {
        return res.status(400).json({
          success: false,
          message: 'Invalid quiz ID',
        })
      }

      // Validate question
      if (
        typeof question !== 'string' ||
        !question.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: 'Question is required',
        })
      }

      // Validate options is an array
      if (!Array.isArray(options)) {
        return res.status(400).json({
          success: false,
          message: 'Options are required',
        })
      }

      // Exactly four options are required
      if (options.length !== 4) {
        return res.status(400).json({
          success: false,
          message: 'Exactly 4 options are required',
        })
      }

      // Validate each option
      for (const option of options) {
        if (
          typeof option !== 'object' ||
          option === null ||
          typeof option.text !== 'string' ||
          !option.text.trim() ||
          typeof option.isCorrect !== 'boolean'
        ) {
          return res.status(400).json({
            success: false,
            message:
              'Each option must have valid text and isCorrect value',
          })
        }
      }

      // Exactly one option must be correct
      const correctOptions = options.filter(
        (option: { isCorrect: boolean }) =>
          option.isCorrect === true,
      )

      if (correctOptions.length !== 1) {
        return res.status(400).json({
          success: false,
          message: 'Exactly one option must be correct',
        })
      }

      // Find quiz and its course
      const quiz = await prisma.quiz.findUnique({
        where: {
          id: parsedQuizId,
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

      // Verify educator owns the course
      const educatorId = req.user!.userId

      if (
        quiz.lesson.module.course.educatorId !==
        Number(educatorId)
      ) {
        return res.status(403).json({
          success: false,
          message:
            'You can only add questions to quizzes in your own courses',
        })
      }

      // Create question and options
      const createdQuestion = await prisma.question.create({
        data: {
          question: question.trim(),
          quizId: parsedQuizId,
          options: {
            create: options.map(
              (option: {
                text: string
                isCorrect: boolean
              }) => ({
                text: option.text.trim(),
                isCorrect: option.isCorrect,
              }),
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
  },
)

// Get all attempts for the logged-in student

router.get(
  '/attempts/user/:userId',
  authenticateToken,
  requireRole('STUDENT'),
  async (req: AuthRequest, res) => {
    try {
      // Always use the authenticated user's ID.
      // Do not trust the userId from the URL.
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

      return res.json({
        success: true,
        data: attempts,
      })
    } catch (error) {
      console.error('Failed to fetch quiz attempts:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to fetch quiz attempts',
      })
    }
  },
)

// Get a quiz

router.get(
  '/:id',
  authenticateToken,
  requireRole('STUDENT', 'EDUCATOR'),
  async (req: AuthRequest, res) => {
    try {
      const quizId = Number(req.params.id)
      const userId = req.user!.userId

      if (
        !Number.isInteger(quizId) ||
        quizId < 1
      ) {
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
              module: {
                select: {
                  courseId: true,
                  course: {
                    select: {
                      id: true,
                      educatorId: true,
                    },
                  },
                },
              },
            },
          },
          questions: {
            orderBy: {
              id: 'asc',
            },
            include: {
              options: {
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

      const courseId = quiz.lesson.module.courseId
      const educatorId = quiz.lesson.module.course.educatorId

      // Course educator can access their own quizzes.
      if (educatorId === userId) {
        return res.json({
          success: true,
          data: quiz,
        })
      }

      // Students must be enrolled in the course.
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
          message:
            'You must be enrolled in this course to access this quiz',
        })
      }

      return res.json({
        success: true,
        data: quiz,
      })
    } catch (error) {
      console.error('Failed to fetch quiz:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to fetch quiz',
      })
    }
  },
)

// Submit a quiz

router.post(
  '/:id/submit',
  authenticateToken,
  requireRole('STUDENT'),
  async (req: AuthRequest, res) => {
    try {
      const quizId = Number(req.params.id)
      const { answers } = req.body
      const userId = req.user!.userId

      // Validate quiz ID
      if (!Number.isInteger(quizId) || quizId < 1) {
        return res.status(400).json({
          success: false,
          message: 'Invalid quiz ID',
        })
      }

      // Validate answers
      if (!Array.isArray(answers) || answers.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one answer is required',
        })
      }

      // Find quiz and its questions/options
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

      // Quiz must contain at least one question
      if (quiz.questions.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Quiz has no questions',
        })
      }

      // Validate answer objects and IDs
      const answeredQuestionIds = new Set<number>()

      for (const answer of answers) {
        if (
          typeof answer !== 'object' ||
          answer === null ||
          answer.questionId === undefined ||
          answer.questionId === null ||
          answer.optionId === undefined ||
          answer.optionId === null
        ) {
          return res.status(400).json({
            success: false,
            message:
              'Each answer must contain questionId and optionId',
          })
        }

        const questionId = Number(answer.questionId)
        const optionId = Number(answer.optionId)

        if (
          !Number.isInteger(questionId) ||
          questionId < 1 ||
          !Number.isInteger(optionId) ||
          optionId < 1
        ) {
          return res.status(400).json({
            success: false,
            message:
              'questionId and optionId must be positive integers',
          })
        }

        // Reject duplicate question IDs
        if (answeredQuestionIds.has(questionId)) {
          return res.status(400).json({
            success: false,
            message:
              `Question ${questionId} was answered more than once`,
          })
        }

        answeredQuestionIds.add(questionId)
      }

      // Verify enrollment
      const enrollment = await prisma.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId,
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

      // Verify user exists
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

      let correctAnswers = 0

      // Validate each submitted question and option
      for (const answer of answers) {
        const questionId = Number(answer.questionId)
        const optionId = Number(answer.optionId)

        const question = quiz.questions.find(
          (item) => item.id === questionId,
        )

        // Prevent cross-quiz question injection
        if (!question) {
          return res.status(400).json({
            success: false,
            message:
              `Question ${answer.questionId} does not belong to this quiz`,
          })
        }

        const selectedOption = question.options.find(
          (option) => option.id === optionId,
        )

        // Prevent selecting an option belonging to another question
        if (!selectedOption) {
          return res.status(400).json({
            success: false,
            message:
              `Option ${answer.optionId} does not belong to question ${answer.questionId}`,
          })
        }

        if (selectedOption.isCorrect) {
          correctAnswers++
        }
      }

      // Verify that every quiz question was answered
      for (const question of quiz.questions) {
        if (!answeredQuestionIds.has(question.id)) {
          return res.status(400).json({
            success: false,
            message:
              `Question ${question.id} must be answered`,
          })
        }
      }

      // Reject extra answers
      if (answers.length !== quiz.questions.length) {
        return res.status(400).json({
          success: false,
          message: 'All quiz questions must be answered',
        })
      }

      const totalQuestions = quiz.questions.length

      const score = Math.round(
        (correctAnswers / totalQuestions) * 100,
      )

      // Create attempt
      const attempt = await prisma.quizAttempt.create({
        data: {
          userId,
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
  },
)

export default router
