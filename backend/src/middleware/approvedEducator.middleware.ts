import { NextFunction, Response } from 'express'
import prisma from '../lib/prisma.js'
import { AuthRequest } from './auth.middleware.js'

export const requireApprovedEducator = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { educatorApprovalStatus: true },
    })

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      })
    }

    if (user.educatorApprovalStatus !== 'APPROVED') {
      return res.status(403).json({
        success: false,
        message: 'Educator approval is required for this action',
      })
    }

    return next()
  } catch (error) {
    return next(error)
  }
}
