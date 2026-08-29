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

export default router