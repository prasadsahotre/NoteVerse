import { createContext } from 'react'

export interface User {
  id: number
  name: string
  email: string
  roles: string[]
  educatorApprovalStatus: 'NOT_APPLICABLE' | 'PENDING' | 'APPROVED' | 'REJECTED'
}

export type RegistrationRole = 'STUDENT' | 'EDUCATOR'

export interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<User>
  register: (name: string, email: string, password: string, role: RegistrationRole) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<
  AuthContextValue | undefined
>(undefined)
