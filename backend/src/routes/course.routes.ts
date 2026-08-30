import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const courses = await prisma.course.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    })

    res.json({
      success: true,
      data: courses,
    })
  } catch (error) {
    console.error('Failed to fetch courses:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to fetch courses',
    })
  }
})

router.post('/', async (req, res) => {
  try {
    const { title, description, educatorId } = req.body

    if (!title || !educatorId) {
      return res.status(400).json({
        success: false,
        message: 'Title and educatorId are required',
      })
    }

    const educator = await prisma.user.findUnique({
      where: {
        id: Number(educatorId),
      },
    })

    if (!educator) {
      return res.status(404).json({
        success: false,
        message: 'Educator not found',
      })
    }

    const course = await prisma.course.create({
      data: {
        title,
        description,
        educatorId: Number(educatorId),
      },
    })

    res.status(201).json({
      success: true,
      message: 'Course created successfully',
      data: course,
    })
  } catch (error) {
    console.error('Failed to create course:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to create course',
    })
  }
})

export default router