import { Router } from 'express'
import prisma from '../lib/prisma.js'
import {
  authenticateToken,
  AuthRequest,
} from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/role.middleware.js'

const router = Router()

router.get('/users',authenticateToken,requireRole('ADMIN'),async (req: AuthRequest, res) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          updatedAt: true,
          roles: {
            select: {
              role: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      })

      return res.json({
        success: true,
        data: users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          roles: user.roles.map((userRole) => userRole.role.name),
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        })),
      })
    } catch (error) {
      console.error('Admin users error:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to fetch users',
      })
    }
  },
)

router.patch('/users/:id/role',authenticateToken,requireRole('ADMIN'),async (req: AuthRequest, res) => {
    try {
      const userId = Number(req.params.id)
      const { role } = req.body

      if (!Number.isInteger(userId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID',
        })
      }

      const normalizedRole = String(role || '').toUpperCase()

      if (!['STUDENT', 'EDUCATOR'].includes(normalizedRole)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role. Use STUDENT or EDUCATOR',
        })
      }

      const user = await prisma.user.findUnique({
        where: {
          id: userId,
        },
      })

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        })
      }

      const selectedRole = await prisma.role.findUnique({
        where: {
          name: normalizedRole,
        },
      })

      if (!selectedRole) {
        return res.status(400).json({
          success: false,
          message: 'Role not found',
        })
      }

      await prisma.$transaction(async (tx) => {
        await tx.userRole.deleteMany({
            where: {
            userId,
            },
        })

        await tx.userRole.create({
            data: {
            userId,
            roleId: selectedRole.id,
            },
        })
        })

      return res.json({
        success: true,
        message: 'User role updated successfully',
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: normalizedRole,
        },
      })
    } catch (error) {
      console.error('Admin role update error:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to update user role',
      })
    }
  },
)

export default router