import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const modules = await prisma.module.findMany({
      orderBy: [
        {
          courseId: 'asc',
        },
        {
          position: 'asc',
        },
      ],
    })

    res.json({
      success: true,
      data: modules,
    })
  } catch (error) {
    console.error('Failed to fetch modules:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to fetch modules',
    })
  }
})

router.post('/', async (req, res) => {
  try {
    const { title, position, courseId } = req.body

    if (!title || position === undefined || !courseId) {
      return res.status(400).json({
        success: false,
        message: 'Title, position and courseId are required',
      })
    }

    const course = await prisma.course.findUnique({
      where: {
        id: Number(courseId),
      },
    })

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      })
    }

    const module = await prisma.module.create({
      data: {
        title,
        position: Number(position),
        courseId: Number(courseId),
      },
    })

    res.status(201).json({
      success: true,
      message: 'Module created successfully',
      data: module,
    })
  } catch (error) {
    console.error('Failed to create module:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to create module',
    })
  }
})

export default router