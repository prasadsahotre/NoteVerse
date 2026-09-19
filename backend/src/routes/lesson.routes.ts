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

export default router