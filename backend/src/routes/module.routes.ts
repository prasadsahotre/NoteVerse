import { Router } from 'express'
import prisma from '../lib/prisma.js'
import {
  authenticateToken,
  AuthRequest,
} from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/role.middleware.js'
import { requireApprovedEducator } from '../middleware/approvedEducator.middleware.js'
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

router.post('/',authenticateToken,requireRole('EDUCATOR'),requireApprovedEducator,async (req: AuthRequest, res) => {
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

    const educatorId = req.user!.userId

    if (course.educatorId !== educatorId) {
      return res.status(403).json({
        success: false,
        message: 'You can only create modules in your own course',
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

router.patch('/:id',authenticateToken,requireRole('EDUCATOR'),requireApprovedEducator,async (req: AuthRequest, res) => {
  try {
    const moduleId = Number(req.params.id)
    const { educatorId, title, position } = req.body

    if (Number.isNaN(moduleId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid module ID',
      })
    }


    const existingModule = await prisma.module.findUnique({
      where: {
        id: moduleId,
      },
      include: {
        course: true,
      },
    })

    if (!existingModule) {
      return res.status(404).json({
        success: false,
        message: 'Module not found',
      })
    }

    if (existingModule.course.educatorId !== req.user!.userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update modules in your own course',
      })
    }

    if (title === undefined && position === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Nothing to update',
      })
    }

    const updatedModule = await prisma.module.update({
      where: {
        id: moduleId,
      },
      data: {
        ...(title !== undefined && { title }),
        ...(position !== undefined && { position: Number(position) }),
      },
    })

    res.json({
      success: true,
      message: 'Module updated successfully',
      data: updatedModule,
    })
  } catch (error) {
    console.error('Failed to update module:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to update module',
    })
  }
})

router.delete('/:id',authenticateToken,requireRole('EDUCATOR'),requireApprovedEducator,async (req: AuthRequest, res) => {
  try {
    const moduleId = Number(req.params.id)

    if (Number.isNaN(moduleId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid module ID',
      })
    }

    const existingModule = await prisma.module.findUnique({
      where: {
        id: moduleId,
      },
      include: {
        course: true,
      },
    })

    if (!existingModule) {
      return res.status(404).json({
        success: false,
        message: 'Module not found',
      })
    }

    if (existingModule.course.educatorId !== req.user!.userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete modules in your own course',
      })
    }

    await prisma.module.delete({
      where: {
        id: moduleId,
      },
    })

    res.json({
      success: true,
      message: 'Module deleted successfully',
    })
  } catch (error) {
    console.error('Failed to delete module:', error)

    res.status(500).json({
      success: false,
      message: 'Failed to delete module',
    })
  }
})

export default router
