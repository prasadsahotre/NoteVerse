import { Router, Response } from 'express'
import prisma from '../lib/prisma.js'
import {
  authenticateToken,
  AuthRequest,
} from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/role.middleware.js'

const router = Router()

// Create a report
router.post(
  '/',
  authenticateToken,
  requireRole('STUDENT'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { reason, description, courseId, lessonId } = req.body

      if (!reason || typeof reason !== 'string' || !reason.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Report reason is required',
        })
      }

      if (courseId === undefined && lessonId === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Either courseId or lessonId is required',
        })
      }

      if (courseId !== undefined && lessonId !== undefined) {
        return res.status(400).json({
          success: false,
          message: 'Report either a course or a lesson, not both',
        })
      }

      const reporterId = req.user!.userId

      let validatedCourseId: number | undefined
      let validatedLessonId: number | undefined

      if (courseId !== undefined) {
        const parsedCourseId = Number(courseId)

        if (!Number.isInteger(parsedCourseId)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid courseId',
          })
        }

        const course = await prisma.course.findUnique({
          where: { id: parsedCourseId },
        })

        if (!course) {
          return res.status(404).json({
            success: false,
            message: 'Course not found',
          })
        }

        validatedCourseId = parsedCourseId
      }

      if (lessonId !== undefined) {
        const parsedLessonId = Number(lessonId)

        if (!Number.isInteger(parsedLessonId)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid lessonId',
          })
        }

        const lesson = await prisma.lesson.findUnique({
          where: { id: parsedLessonId },
        })

        if (!lesson) {
          return res.status(404).json({
            success: false,
            message: 'Lesson not found',
          })
        }

        validatedLessonId = parsedLessonId
      }

      const report = await prisma.report.create({
        data: {
          reason: reason.trim(),
          description:
            typeof description === 'string'
              ? description.trim() || null
              : null,
          reporterId,
          courseId: validatedCourseId,
          lessonId: validatedLessonId,
        },
      })

      return res.status(201).json({
        success: true,
        message: 'Report submitted successfully',
        data: report,
      })
    } catch (error) {
      console.error('Create report error:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to create report',
      })
    }
  },
)

export default router