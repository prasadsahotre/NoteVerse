import { Router } from 'express'
import prisma from '../lib/prisma.js'
import {
  authenticateToken,
  AuthRequest,
} from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/role.middleware.js'

const router = Router()

// Create a course review
router.post('/',authenticateToken,requireRole('STUDENT'),async (req: AuthRequest, res) => {
  try {
    const { courseId, rating, review } = req.body
    const userId = req.user!.userId

    if (!courseId || !rating) {
      return res.status(400).json({
        success: false,
        message: 'courseId and rating are required',
      })
    }

    const numericUserId = userId
    const numericCourseId = Number(courseId)
    const numericRating = Number(rating)

    if (
      Number.isNaN(numericUserId) ||
      Number.isNaN(numericCourseId) ||
      Number.isNaN(numericRating)
    ) {
      return res.status(400).json({
        success: false,
        message: 'userId, courseId and rating must be valid numbers',
      })
    }

    if (numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5',
      })
    }

    const user = await prisma.user.findUnique({
      where: {
        id: numericUserId,
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
        id: numericCourseId,
      },
    })

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      })
    }

    const existingReview = await prisma.courseReview.findUnique({
      where: {
        userId_courseId: {
          userId: numericUserId,
          courseId: numericCourseId,
        },
      },
    })

    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: 'You have already reviewed this course',
      })
    }

    const courseReview = await prisma.courseReview.create({
      data: {
        userId: numericUserId,
        courseId: numericCourseId,
        rating: numericRating,
        review: review?.trim() || null,
      },
    })

    res.status(201).json({
      success: true,
      message: 'Course review created successfully',
      data: courseReview,
    })
  } catch (error) {
    console.error('Failed to create course review:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to create course review',
    })
  }
})

// Get all reviews for a course
router.get('/course/:courseId', async (req, res) => {
  try {
    const courseId = Number(req.params.courseId)

    if (Number.isNaN(courseId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid course ID',
      })
    }

    const course = await prisma.course.findUnique({
      where: {
        id: courseId,
      },
    })

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      })
    }

    const reviews = await prisma.courseReview.findMany({
      where: {
        courseId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    const totalReviews = reviews.length

    const averageRating =
      totalReviews > 0
        ? reviews.reduce((sum, review) => sum + review.rating, 0) /
          totalReviews
        : 0

    res.json({
      success: true,
      data: {
        courseId,
        totalReviews,
        averageRating: Number(averageRating.toFixed(2)),
        reviews,
      },
    })
  } catch (error) {
    console.error('Failed to fetch course reviews:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to fetch course reviews',
    })
  }
})

// Update a course review
router.patch('/:id',authenticateToken,requireRole('STUDENT'),async (req: AuthRequest, res) => {
  try {
    const reviewId = Number(req.params.id)
    const { rating, review } = req.body
    const userId = req.user!.userId

    if (Number.isNaN(reviewId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid review ID',
      })
    }

    if (!rating) {
      return res.status(400).json({
        success: false,
        message: 'userId and rating are required',
      })
    }

    const numericUserId = userId
    const numericRating = Number(rating)

    if (
      Number.isNaN(numericUserId) ||
      Number.isNaN(numericRating)
    ) {
      return res.status(400).json({
        success: false,
        message: 'userId and rating must be valid numbers',
      })
    }

    if (numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5',
      })
    }

    const existingReview = await prisma.courseReview.findUnique({
      where: {
        id: reviewId,
      },
    })

    if (!existingReview) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      })
    }

    if (existingReview.userId !== numericUserId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own review',
      })
    }

    const updatedReview = await prisma.courseReview.update({
      where: {
        id: reviewId,
      },
      data: {
        rating: numericRating,
        review: review?.trim() || null,
      },
    })

    res.json({
      success: true,
      message: 'Course review updated successfully',
      data: updatedReview,
    })
  } catch (error) {
    console.error('Failed to update course review:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to update course review',
    })
  }
})

// Delete a course review
router.delete('/:id',authenticateToken,requireRole('STUDENT'),async (req: AuthRequest, res) => {
  try {
    const reviewId = Number(req.params.id)
    const userId = req.user!.userId

    if (Number.isNaN(reviewId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid review ID',
      })
    }

    const existingReview = await prisma.courseReview.findUnique({
      where: {
        id: reviewId,
      },
    })

    if (!existingReview) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      })
    }

    if (existingReview.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own review',
      })
    }

    await prisma.courseReview.delete({
      where: {
        id: reviewId,
      },
    })

    res.json({
      success: true,
      message: 'Course review deleted successfully',
    })
  } catch (error) {
    console.error('Failed to delete course review:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to delete course review',
    })
  }
})

export default router