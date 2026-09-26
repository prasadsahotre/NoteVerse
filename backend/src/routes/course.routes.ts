import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const courses = await prisma.course.findMany({
      where: {
        status: 'PUBLISHED',
      },
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

router.get('/educator/:educatorId', async (req, res) => {
  try {
    const educatorId = Number(req.params.educatorId)

    if (Number.isNaN(educatorId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid educator ID',
      })
    }

    const educator = await prisma.user.findUnique({
      where: {
        id: educatorId,
      },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    })

    if (!educator) {
      return res.status(404).json({
        success: false,
        message: 'Educator not found',
      })
    }

    const isEducator = educator.roles.some(
      (userRole) => userRole.role.name === 'EDUCATOR'
    )

    if (!isEducator) {
      return res.status(403).json({
        success: false,
        message: 'User is not an educator',
      })
    }

    const courses = await prisma.course.findMany({
      where: {
        educatorId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    res.json({
      success: true,
      data: courses,
    })
  } catch (error) {
    console.error("Failed to fetch educator's courses:", error)

    res.status(500).json({
      success: false,
      message: "Failed to fetch educator's courses",
    })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const courseId = Number(req.params.id)

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
      include: {
        modules: {
          orderBy: {
            position: 'asc',
          },
          include: {
            lessons: {
              orderBy: {
                position: 'asc',
              },
            },
          },
        },
      },
    })

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      })
    }

    res.json({
      success: true,
      data: course,
    })
  } catch (error) {
    console.error('Failed to fetch course:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to fetch course',
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

router.patch('/:id', async (req, res) => {
  try {
    const courseId = Number(req.params.id)
    const { educatorId, title, description } = req.body

    if (Number.isNaN(courseId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid course ID',
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

    const existingCourse = await prisma.course.findUnique({
      where: {
        id: courseId,
      },
    })

    if (!existingCourse) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      })
    }

    if (existingCourse.educatorId !== numericEducatorId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own course',
      })
    }

    if (!title && description === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Nothing to update',
      })
    }

    const updatedCourse = await prisma.course.update({
      where: {
        id: courseId,
      },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
      },
    })

    res.json({
      success: true,
      message: 'Course updated successfully',
      data: updatedCourse,
    })
  } catch (error) {
    console.error('Failed to update course:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to update course',
    })
  }
})

router.patch('/:id/publish', async (req, res) => {
  try {
    const courseId = Number(req.params.id)
    const { educatorId } = req.body

    if (Number.isNaN(courseId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid course ID',
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

    const existingCourse = await prisma.course.findUnique({
      where: {
        id: courseId,
      },
    })

    if (!existingCourse) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      })
    }

    if (existingCourse.educatorId !== numericEducatorId) {
      return res.status(403).json({
        success: false,
        message: 'You can only publish your own course',
      })
    }

    if (existingCourse.status === 'PUBLISHED') {
      return res.status(400).json({
        success: false,
        message: 'Course is already published',
      })
    }

    const publishedCourse = await prisma.course.update({
      where: {
        id: courseId,
      },
      data: {
        status: 'PUBLISHED',
      },
    })

    res.json({
      success: true,
      message: 'Course published successfully',
      data: publishedCourse,
    })
  } catch (error) {
    console.error('Failed to publish course:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to publish course',
    })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const courseId = Number(req.params.id)
    const { educatorId } = req.body

    if (Number.isNaN(courseId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid course ID',
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

    const existingCourse = await prisma.course.findUnique({
      where: {
        id: courseId,
      },
    })

    if (!existingCourse) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      })
    }

    if (existingCourse.educatorId !== numericEducatorId) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own course',
      })
    }

    await prisma.course.delete({
      where: {
        id: courseId,
      },
    })

    res.json({
      success: true,
      message: 'Course deleted successfully',
    })
  } catch (error) {
    console.error('Failed to delete course:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to delete course',
    })
  }
})

export default router