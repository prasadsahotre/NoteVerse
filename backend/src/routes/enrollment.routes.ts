import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const enrollments = await prisma.enrollment.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        course: {
          select: {
            id: true,
            title: true,
            description: true,
          },
        },
      },
    })

    res.json({
      success: true,
      data: enrollments,
    })
  } catch (error) {
    console.error('Failed to fetch enrollments:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to fetch enrollments',
    })
  }
})

router.post('/', async (req, res) => {
  try {
    const { userId, courseId } = req.body

    if (!userId || !courseId) {
      return res.status(400).json({
        success: false,
        message: 'userId and courseId are required',
      })
    }

    const user = await prisma.user.findUnique({
      where: {
        id: Number(userId),
      },
    })

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
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

    const enrollment = await prisma.enrollment.create({
      data: {
        userId: Number(userId),
        courseId: Number(courseId),
      },
    })

    res.status(201).json({
      success: true,
      message: 'Enrollment successful',
      data: enrollment,
    })
    } catch (error: any) {
    console.error('Failed to create enrollment:', error)

    if (error?.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'User is already enrolled in this course',
      })
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create enrollment',
    })
  }
})

export default router