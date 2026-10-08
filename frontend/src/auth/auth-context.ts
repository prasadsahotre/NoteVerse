import { createContext } from 'react'

export interface User {
  id: number
  name: string
  email: string
  roles: string[]
}

export interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<
  AuthContextValue | undefined
>(undefined)