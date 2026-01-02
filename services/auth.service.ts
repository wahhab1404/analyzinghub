import { createClient } from '@/lib/supabase/client'
import { RoleName } from '@/lib/types/database'

export interface SignUpData {
  email: string
  password: string
  fullName: string
  role: RoleName
}

export interface SignInData {
  email: string
  password: string
}

export class AuthService {
  private supabase = createClient()

  async signUp(data: SignUpData) {
    const { email, password, fullName, role } = data

    const { data: authData, error: signUpError } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: role,
        },
      },
    })

    if (signUpError) {
      throw new Error(signUpError.message)
    }

    if (!authData.user) {
      throw new Error('Failed to create user')
    }

    return authData
  }

  async signIn(data: SignInData) {
    const { email, password } = data

    const { data: authData, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      throw new Error(error.message)
    }

    return authData
  }

  async signOut() {
    const { error } = await this.supabase.auth.signOut()

    if (error) {
      throw new Error(error.message)
    }
  }

  async getCurrentSession() {
    const { data: { session }, error } = await this.supabase.auth.getSession()

    if (error) {
      throw new Error(error.message)
    }

    return session
  }
}

export const authService = new AuthService()
