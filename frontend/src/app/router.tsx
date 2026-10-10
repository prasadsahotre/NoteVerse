import { createBrowserRouter } from 'react-router-dom'
import HomeRoute from '../components/HomeRoute'
import NotFoundPage from '../pages/NotFoundPage'
import StudentDashboard from '../pages/StudentDashboard'
import EducatorDashboard from '../pages/EducatorDashboard'
import EducatorCurriculumPage from '../pages/EducatorCurriculumPage'
import AdminDashboard from '../pages/AdminDashboard'
import ProtectedRoute from '../components/ProtectedRoute'
import StudentCoursePage from '../pages/StudentCoursePage'
import StudentCourseDiscoveryPage from '../pages/StudentCourseDiscoveryPage'
import StudentCoursePreviewPage from '../pages/StudentCoursePreviewPage'
import StudentLessonPage from '../pages/StudentLessonPage'
import StudentQuizPage from '../pages/StudentQuizPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <HomeRoute />,
  },
  {
    path: '/student',
    element: (
      <ProtectedRoute allowedRoles={['STUDENT']}>
        <StudentDashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: '/student/discover',
    element: (
      <ProtectedRoute allowedRoles={['STUDENT']}>
        <StudentCourseDiscoveryPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/student/discover/:courseId',
    element: (
      <ProtectedRoute allowedRoles={['STUDENT']}>
        <StudentCoursePreviewPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/student/courses/:courseId',
    element: (
      <ProtectedRoute allowedRoles={['STUDENT']}>
        <StudentCoursePage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/student/courses/:courseId/lessons/:lessonId',
    element: (
      <ProtectedRoute allowedRoles={['STUDENT']}>
        <StudentLessonPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/student/quizzes/:quizId',
    element: (
      <ProtectedRoute allowedRoles={['STUDENT']}>
        <StudentQuizPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/educator/courses/:courseId/curriculum',
    element: (
      <ProtectedRoute allowedRoles={['EDUCATOR']}>
        <EducatorCurriculumPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/educator',
    element: (
      <ProtectedRoute allowedRoles={['EDUCATOR']}>
        <EducatorDashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin',
    element: (
      <ProtectedRoute allowedRoles={['ADMIN']}>
        <AdminDashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
])
