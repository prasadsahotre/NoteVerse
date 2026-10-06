import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '../../api/client'

export interface Enrollment {
  id: number
  userId: number
  courseId: number
  createdAt: string
  course: {
    id: number
    title: string
    description: string
    status: string
  }
}

interface EnrollmentsResponse {
  success: boolean
  data: Enrollment[]
}

export interface CourseProgress {
  courseId: number
  courseTitle: string
  totalLessons: number
  completedLessons: number
  progressPercentage: number
}

interface CourseProgressResponse {
  success: boolean
  data: CourseProgress
}

export function useMyEnrollments(userId: number | undefined) {
  return useQuery({
    queryKey: ['my-enrollments', userId],
    queryFn: async () => {
      if (!userId) {
        throw new Error('User ID is required')
      }

      const response = await apiRequest<EnrollmentsResponse>(
        `/enrollments/user/${userId}`,
      )

      return response.data
    },
    enabled: Boolean(userId),
  })
}

export function useCourseProgress(
  userId: number | undefined,
  courseId: number,
) {
  return useQuery({
    queryKey: ['course-progress', userId, courseId],
    queryFn: async () => {
      if (!userId) {
        throw new Error('User ID is required')
      }

      const response = await apiRequest<CourseProgressResponse>(
        `/progress/user/${userId}/course/${courseId}`,
      )

      return response.data
    },
    enabled: Boolean(userId) && courseId > 0,
  })
}