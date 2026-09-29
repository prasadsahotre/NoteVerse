import { Router } from 'express'
import prisma from '../lib/prisma.js'

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
router.post('/', async (req, res) => {
  try {
    const { title, type, url, lessonId, educatorId } = req.body

    if (!title || !type || !url || !lessonId || !educatorId) {
      return res.status(400).json({
        success: false,
        message: 'Title, type, url, lessonId and educatorId are required',
      })
    }

    const numericLessonId = Number(lessonId)
    const numericEducatorId = Number(educatorId)

    if (
      Number.isNaN(numericLessonId) ||
      Number.isNaN(numericEducatorId)
    ) {
      return res.status(400).json({
        success: false,
        message: 'lessonId and educatorId must be valid numbers',
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

    if (lesson.module.course.educatorId !== numericEducatorId) {
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
router.patch('/:id', async (req, res) => {
  try {
    const resourceId = Number(req.params.id)
    const { educatorId, title, type, url } = req.body

    if (Number.isNaN(resourceId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid resource ID',
      })
    }

    if (!educatorId) {
      return res.status(400).json({
        success: false,
        message: 'educatorId is required',
      })
    }

    const numericEducatorId = Number(educatorId)

    if (Number.isNaN(numericEducatorId)) {
      return res.status(400).json({
        success: false,
        message: 'educatorId must be a valid number',
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

    if (
      existingResource.lesson.module.course.educatorId !==
      numericEducatorId
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
router.delete('/:id', async (req, res) => {
  try {
    const resourceId = Number(req.params.id)
    const { educatorId } = req.body

    if (Number.isNaN(resourceId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid resource ID',
      })
    }

    if (!educatorId) {
      return res.status(400).json({
        success: false,
        message: 'educatorId is required',
      })
    }

    const numericEducatorId = Number(educatorId)

    if (Number.isNaN(numericEducatorId)) {
      return res.status(400).json({
        success: false,
        message: 'educatorId must be a valid number',
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

    if (
      existingResource.lesson.module.course.educatorId !==
      numericEducatorId
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