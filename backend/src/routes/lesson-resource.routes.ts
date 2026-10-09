import { Router } from 'express'
import { randomUUID } from 'crypto'
import path from 'path'

import prisma from '../lib/prisma.js'
import {
  authenticateToken,
  AuthRequest,
} from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/role.middleware.js'
import { requireApprovedEducator } from '../middleware/approvedEducator.middleware.js'
import upload from '../middleware/upload.middleware.js'
import {
  uploadToS3,
  deleteFromS3,
  generatePresignedDownloadUrl,
} from '../lib/s3-upload.js'

const router = Router()

// Get all resources for a lesson
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

    const resources = await prisma.lessonResource.findMany({
      where: {
        lessonId,
      },
      select: {
        id: true,
        title: true,
        type: true,
        lessonId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    res.json({
      success: true,
      data: resources,
    })
  } catch (error) {
    console.error('Failed to fetch lesson resources:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to fetch lesson resources',
    })
  }
})

// Upload a file resource to S3
router.post(
  '/upload',
  authenticateToken,
  requireRole('EDUCATOR'),
  requireApprovedEducator,
  upload.single('file'),
  async (req: AuthRequest, res) => {
    try {
      const { title, type, lessonId } = req.body

      if (!title || !type || !lessonId) {
        return res.status(400).json({
          success: false,
          message: 'Title, type and lessonId are required',
        })
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'File is required',
        })
      }

      const numericLessonId = Number(lessonId)

      if (Number.isNaN(numericLessonId)) {
        return res.status(400).json({
          success: false,
          message: 'lessonId must be a valid number',
        })
      }

      const allowedTypes = ['PDF', 'AUDIO', 'VIDEO', 'IMAGE']

      if (!allowedTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid resource type',
        })
      }

      const lesson = await prisma.lesson.findUnique({
        where: {
          id: numericLessonId,
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

      const educatorId = req.user!.userId

      if (lesson.module.course.educatorId !== educatorId) {
        return res.status(403).json({
          success: false,
          message: 'You can only upload resources to your own course',
        })
      }

      const extension = path.extname(req.file.originalname)

      const storageKey =
        `courses/${lesson.module.course.id}/lessons/` +
        `${numericLessonId}/${randomUUID()}${extension}`

      let uploadedToS3 = false

      try {
        // Upload file to S3
        await uploadToS3(
          storageKey,
          req.file.buffer,
          req.file.mimetype,
        )

        uploadedToS3 = true

        // Create database record
        const resource = await prisma.lessonResource.create({
          data: {
            title,
            type,
            url: '',
            storageKey,
            lessonId: numericLessonId,
          },
        })

        return res.status(201).json({
          success: true,
          message: 'Lesson resource uploaded successfully',
          data: resource,
        })
      } catch (error) {
        // If S3 upload succeeded but database creation failed,
        // remove the orphaned S3 object.
        if (uploadedToS3) {
          try {
            await deleteFromS3(storageKey)
          } catch (cleanupError) {
            console.error(
              'Failed to clean up uploaded S3 object:',
              cleanupError,
            )
          }
        }

        throw error
      }
    } catch (error) {
      console.error('Failed to upload lesson resource:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to upload lesson resource',
      })
    }
  },
)

// Create a resource
router.post(
  '/',
  authenticateToken,
  requireRole('EDUCATOR'),
  requireApprovedEducator,
  async (req: AuthRequest, res) => {
    try {
      const { title, type, url, lessonId } = req.body

      if (!title || !type || !url || !lessonId) {
        return res.status(400).json({
          success: false,
          message: 'Title, type, url and lessonId are required',
        })
      }

      const numericLessonId = Number(lessonId)

      if (Number.isNaN(numericLessonId)) {
        return res.status(400).json({
          success: false,
          message: 'lessonId must be a valid number',
        })
      }

      const lesson = await prisma.lesson.findUnique({
        where: {
          id: numericLessonId,
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

      const educatorId = req.user!.userId

      if (lesson.module.course.educatorId !== educatorId) {
        return res.status(403).json({
          success: false,
          message: 'You can only add resources to your own course',
        })
      }

      const resource = await prisma.lessonResource.create({
        data: {
          title,
          type,
          url,
          lessonId: numericLessonId,
        },
      })

      res.status(201).json({
        success: true,
        message: 'Lesson resource created successfully',
        data: resource,
      })
    } catch (error) {
      console.error('Failed to create lesson resource:', error)

      res.status(500).json({
        success: false,
        message: 'Failed to create lesson resource',
      })
    }
  },
)

router.get(
  '/:id/download',
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const resourceId = Number(req.params.id)

      if (Number.isNaN(resourceId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid resource ID',
        })
      }

      const resource = await prisma.lessonResource.findUnique({
        where: {
          id: resourceId,
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

      if (!resource) {
        return res.status(404).json({
          success: false,
          message: 'Lesson resource not found',
        })
      }

      if (!resource.storageKey) {
        return res.status(400).json({
          success: false,
          message: 'This resource is not stored in S3',
        })
      }

      const userId = req.user!.userId
      const courseId = resource.lesson.module.course.id
      const educatorId = resource.lesson.module.course.educatorId

      // Course educator has access
      if (userId !== educatorId) {
        // Otherwise, check student enrollment
        const enrollment = await prisma.enrollment.findFirst({
          where: {
            userId,
            courseId,
          },
        })

        if (!enrollment) {
          return res.status(403).json({
            success: false,
            message:
              'You must be enrolled in this course to access this resource',
          })
        }
      }

      const downloadUrl = await generatePresignedDownloadUrl(
        resource.storageKey,
      )

      return res.json({
        success: true,
        data: {
          id: resource.id,
          title: resource.title,
          type: resource.type,
          downloadUrl,
          expiresIn: 900,
        },
      })
    } catch (error) {
      console.error(
        'Failed to generate resource download URL:',
        error,
      )

      return res.status(500).json({
        success: false,
        message: 'Failed to generate download URL',
      })
    }
  },
)

// Update a resource
router.patch(
  '/:id',
  authenticateToken,
  requireRole('EDUCATOR'),
  requireApprovedEducator,
  async (req: AuthRequest, res) => {
    try {
      const resourceId = Number(req.params.id)
      const { title, type, url } = req.body

      if (Number.isNaN(resourceId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid resource ID',
        })
      }

      if (
        title === undefined &&
        type === undefined &&
        url === undefined
      ) {
        return res.status(400).json({
          success: false,
          message: 'Nothing to update',
        })
      }

      const existingResource = await prisma.lessonResource.findUnique({
        where: {
          id: resourceId,
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

      if (!existingResource) {
        return res.status(404).json({
          success: false,
          message: 'Lesson resource not found',
        })
      }

      const educatorId = req.user!.userId

      if (
        existingResource.lesson.module.course.educatorId !==
        educatorId
      ) {
        return res.status(403).json({
          success: false,
          message: 'You can only update resources in your own course',
        })
      }

      const updatedResource = await prisma.lessonResource.update({
        where: {
          id: resourceId,
        },
        data: {
          ...(title !== undefined && { title }),
          ...(type !== undefined && { type }),
          ...(url !== undefined && { url }),
        },
      })

      res.json({
        success: true,
        message: 'Lesson resource updated successfully',
        data: updatedResource,
      })
    } catch (error) {
      console.error('Failed to update lesson resource:', error)

      res.status(500).json({
        success: false,
        message: 'Failed to update lesson resource',
      })
    }
  },
)

// Delete a resource
router.delete(
  '/:id',
  authenticateToken,
  requireRole('EDUCATOR'),
  requireApprovedEducator,
  async (req: AuthRequest, res) => {
    try {
      const resourceId = Number(req.params.id)

      if (Number.isNaN(resourceId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid resource ID',
        })
      }

      const existingResource = await prisma.lessonResource.findUnique({
        where: {
          id: resourceId,
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

      if (!existingResource) {
        return res.status(404).json({
          success: false,
          message: 'Lesson resource not found',
        })
      }

      const educatorId = req.user!.userId

      if (
        existingResource.lesson.module.course.educatorId !==
        educatorId
      ) {
        return res.status(403).json({
          success: false,
          message: 'You can only delete resources from your own course',
        })
      }

      if (existingResource.storageKey) {
        await deleteFromS3(existingResource.storageKey)
      }

      await prisma.lessonResource.delete({
        where: {
          id: resourceId,
        },
      })

      res.json({
        success: true,
        message: 'Lesson resource deleted successfully',
      })
    } catch (error) {
      console.error('Failed to delete lesson resource:', error)

      res.status(500).json({
        success: false,
        message: 'Failed to delete lesson resource',
      })
    }
  },
)

export default router
