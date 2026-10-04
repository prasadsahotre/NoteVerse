import { Router } from 'express'
import crypto from 'crypto'

import prisma from '../lib/prisma.js'
import {
  authenticateToken,
  AuthRequest,
} from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/role.middleware.js'
import { generateCertificatePdf } from '../services/certificate.service.js'

const router = Router()

// Issue a certificate for a completed course
router.post('/',authenticateToken,requireRole('STUDENT'),async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId
      const courseId = Number(req.body.courseId)

      if (Number.isNaN(courseId)) {
        return res.status(400).json({
          success: false,
          message: 'courseId must be a valid number',
        })
      }

      // Check enrollment
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
          message: 'You must be enrolled in this course',
        })
      }

      // Get all lessons in the course
      const lessons = await prisma.lesson.findMany({
        where: {
          module: {
            courseId,
          },
        },
        select: {
          id: true,
        },
      })

      if (lessons.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'This course has no lessons',
        })
      }

      // Count completed lessons
      const completedLessons = await prisma.lessonProgress.count({
        where: {
          userId,
          lessonId: {
            in: lessons.map((lesson) => lesson.id),
          },
          completed: true,
        },
      })

      if (completedLessons !== lessons.length) {
        return res.status(400).json({
          success: false,
          message: 'You must complete all lessons before receiving a certificate',
          data: {
            totalLessons: lessons.length,
            completedLessons,
            completionPercentage: Math.round(
              (completedLessons / lessons.length) * 100,
            ),
          },
        })
      }

      // Prevent duplicate certificates
      const existingCertificate = await prisma.certificate.findUnique({
        where: {
          userId_courseId: {
            userId,
            courseId,
          },
        },
      })

      if (existingCertificate) {
        return res.status(409).json({
          success: false,
          message: 'Certificate already issued for this course',
          data: existingCertificate,
        })
      }

      const certificateNo = `NV-${Date.now()}-${crypto
        .randomBytes(4)
        .toString('hex')
        .toUpperCase()}`

      const certificate = await prisma.certificate.create({
        data: {
          certificateNo,
          userId,
          courseId,
        },
      })

      return res.status(201).json({
        success: true,
        message: 'Certificate issued successfully',
        data: certificate,
      })
    } catch (error) {
      console.error('Failed to issue certificate:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to issue certificate',
      })
    }
  },
)

// Get certificates belonging to the logged-in student
router.get('/',authenticateToken,requireRole('STUDENT'),async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.userId

      const certificates = await prisma.certificate.findMany({
        where: {
          userId,
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        orderBy: {
          issuedAt: 'desc',
        },
      })

      return res.json({
        success: true,
        data: certificates,
      })
    } catch (error) {
      console.error('Failed to fetch certificates:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to fetch certificates',
      })
    }
  },
)

router.get('/verify/:certificateNo',async (req, res) => {
    try {
      const certificateNo = req.params.certificateNo

      const certificate = await prisma.certificate.findUnique({
        where: {
          certificateNo,
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      if (!certificate) {
        return res.status(404).json({
          success: false,
          message: 'Certificate not found',
        })
      }

      return res.json({
        success: true,
        data: {
          valid: true,
          certificateNo: certificate.certificateNo,
          student: certificate.user.name,
          course: certificate.course.title,
          issuedAt: certificate.issuedAt,
        },
      })
    } catch (error) {
      console.error('Certificate verification error:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to verify certificate',
      })
    }
  },
)

router.get('/:id/download',authenticateToken,requireRole('STUDENT'),async (req: AuthRequest, res) => {
    try {
      const certificateId = Number(req.params.id)

      if (Number.isNaN(certificateId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid certificate ID',
        })
      }

      const certificate = await prisma.certificate.findFirst({
        where: {
          id: certificateId,
          userId: req.user!.userId,
        },
        include: {
          course: {
            select: {
              title: true,
            },
          },
          user: {
            select: {
              name: true,
            },
          },
        },
      })

      if (!certificate) {
        return res.status(404).json({
          success: false,
          message: 'Certificate not found',
        })
      }

      const pdfBuffer = await generateCertificatePdf({
        certificateNo: certificate.certificateNo,
        studentName: certificate.user.name,
        courseName: certificate.course.title,
        issuedAt: certificate.issuedAt,
      })

      res.setHeader('Content-Type', 'application/pdf')

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="NoteVerse-Certificate-${certificate.certificateNo}.pdf"`,
      )

      return res.send(pdfBuffer)
    } catch (error) {
      console.error('Certificate PDF generation error:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to generate certificate PDF',
      })
    }
  },
)

// Get one certificate belonging to the logged-in student
router.get('/:id',authenticateToken,requireRole('STUDENT'),async (req: AuthRequest, res) => {
    try {
      const certificateId = Number(req.params.id)

      if (Number.isNaN(certificateId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid certificate ID',
        })
      }

      const certificate = await prisma.certificate.findFirst({
        where: {
          id: certificateId,
          userId: req.user!.userId,
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              description: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      if (!certificate) {
        return res.status(404).json({
          success: false,
          message: 'Certificate not found',
        })
      }

      return res.json({
        success: true,
        data: certificate,
      })
    } catch (error) {
      console.error('Failed to fetch certificate:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to fetch certificate',
      })
    }
  },
)

export default router