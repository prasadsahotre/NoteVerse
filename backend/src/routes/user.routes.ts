import { Router } from 'express'
import bcrypt from 'bcrypt'
import prisma from '../lib/prisma.js'

const router = Router()

router.post('/', async (req, res) => {
  try {
    const { name, email, password, role } = req.body

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password and role are required',
      })
    }

    const normalizedEmail = email.toLowerCase().trim()

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
      where: { name: role.toUpperCase() },
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

export default router