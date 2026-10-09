import { Router } from 'express'
import bcrypt from 'bcrypt'
import prisma from '../lib/prisma.js'
import jwt from 'jsonwebtoken'
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware.js'

const router = Router()

router.post('/', async (req, res) => {
  try {
    const { name, email, password, role } = req.body

    if (
      typeof name !== 'string' ||
      !name.trim() ||
      typeof email !== 'string' ||
      !email.trim() ||
      typeof password !== 'string' ||
      !password ||
      typeof role !== 'string' ||
      !role.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password and role are required',
      })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const normalizedRole = role.trim().toUpperCase()

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      })
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long',
      })
    }

    if (!['STUDENT', 'EDUCATOR'].includes(normalizedRole)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Use STUDENT or EDUCATOR',
      })
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists',
      })
    }

    const selectedRole = await prisma.role.findUnique({
      where: { name: normalizedRole },
    })

    if (!selectedRole) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Use STUDENT or EDUCATOR',
      })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        educatorApprovalStatus:
          normalizedRole === 'EDUCATOR' ? 'PENDING' : 'NOT_APPLICABLE',
        roles: {
          create: {
            roleId: selectedRole.id,
          },
        },
      },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    })

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles.map((userRole) => userRole.role.name),
        educatorApprovalStatus: user.educatorApprovalStatus,
      },
    })
  } catch (error) {
    console.error('Registration error:', error)

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (
      typeof email !== 'string' ||
      !email.trim() ||
      typeof password !== 'string' ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      })
    }

    const normalizedEmail = email.toLowerCase().trim()

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      })
    }

    const user = await prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    })

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      })
    }

    const passwordMatches = await bcrypt.compare(password, user.password)

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      })
    }

    const token = jwt.sign(
    {
      userId: user.id,
      roles: user.roles.map((userRole) => userRole.role.name),
    },
    process.env.JWT_SECRET!,
    {
      expiresIn: '7d',
    },
  )

  return res.json({
    success: true,
    message: 'Login successful',
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: user.roles.map((userRole) => userRole.role.name),
      educatorApprovalStatus: user.educatorApprovalStatus,
      token,
    },
  })
  } catch (error) {
    console.error('Login error:', error)

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    })
  }
})

router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: req.user!.userId,
      },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    })

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    return res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles.map((userRole) => userRole.role.name),
        educatorApprovalStatus: user.educatorApprovalStatus,
      },
    })
  } catch (error) {
    console.error('Get current user error:', error)

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    })
  }
})

export default router
