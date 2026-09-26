import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const lessons = await prisma.lesson.findMany({
      orderBy: [
        {
          moduleId: 'asc',
        },
        {
          position: 'asc',
        },
      ],
    })

    res.json({
      success: true,
      data: lessons,
    })
  } catch (error) {
    console.error('Failed to fetch lessons:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to fetch lessons',
    })
  }
})

router.post('/', async (req, res) => {
  try {
    const { title, content, position, moduleId } = req.body

    if (!title || position === undefined || !moduleId) {
      return res.status(400).json({
        success: false,
        message: 'Title, position and moduleId are required',
      })
    }

    const module = await prisma.module.findUnique({
      where: {
        id: Number(moduleId),
      },
    })

    if (!module) {
      return res.status(404).json({
        success: false,
        message: 'Module not found',
      })
    }

    const lesson = await prisma.lesson.create({
      data: {
        title,
        content,
        position: Number(position),
        moduleId: Number(moduleId),
      },
    })

    res.status(201).json({
      success: true,
      message: 'Lesson created successfully',
      data: lesson,
    })
  } catch (error) {
    console.error('Failed to create lesson:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to create lesson',
    })
  }
})

router.patch('/:id', async (req, res) => {
  try {
    const lessonId = Number(req.params.id)
    const { educatorId, title, content, position } = req.body

    if (Number.isNaN(lessonId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid lesson ID',
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

    const existingLesson = await prisma.lesson.findUnique({
      where: {
        id: lessonId,
      },
      include: {
        module: {
          include: {
            course: true,
          },
        },
      },
    })

    if (!existingLesson) {
      return res.status(404).json({
        success: false,
        message: 'Lesson not found',
      })
    }

    if (existingLesson.module.course.educatorId !== numericEducatorId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update lessons in your own course',
      })
    }

    if (
      title === undefined &&
      content === undefined &&
      position === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: 'Nothing to update',
      })
    }

    const updatedLesson = await prisma.lesson.update({
      where: {
        id: lessonId,
      },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(position !== undefined && { position: Number(position) }),
      },
    })

    res.json({
      success: true,
      message: 'Lesson updated successfully',
      data: updatedLesson,
    })
  } catch (error) {
    console.error('Failed to update lesson:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to update lesson',
    })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const lessonId = Number(req.params.id)
    const { educatorId } = req.body

    if (Number.isNaN(lessonId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid lesson ID',
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

    const existingLesson = await prisma.lesson.findUnique({
      where: {
        id: lessonId,
      },
      include: {
        module: {
          include: {
            course: true,
          },
        },
      },
    })

    if (!existingLesson) {
      return res.status(404).json({
        success: false,
        message: 'Lesson not found',
      })
    }

    if (existingLesson.module.course.educatorId !== numericEducatorId) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete lessons in your own course',
      })
    }

    await prisma.lesson.delete({
      where: {
        id: lessonId,
      },
    })

    res.json({
      success: true,
      message: 'Lesson deleted successfully',
    })
  } catch (error) {
    console.error('Failed to delete lesson:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to delete lesson',
    })
  }
})

export default router