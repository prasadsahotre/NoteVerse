import { Router } from 'express'
import prisma from '../lib/prisma.js'
import {
  authenticateToken,
  AuthRequest,
} from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/role.middleware.js'

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

// Create a resource
router.post('/',authenticateToken,requireRole('EDUCATOR'),async (req: AuthRequest, res) => {
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
})

// Update a resource
router.patch('/:id',authenticateToken,requireRole('EDUCATOR'),async (req: AuthRequest, res) => {
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
})

// Delete a resource
router.delete('/:id',authenticateToken,requireRole('EDUCATOR'),async (req: AuthRequest, res) => {
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
})


export default router