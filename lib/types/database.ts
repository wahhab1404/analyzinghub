export type RoleName = 'SuperAdmin' | 'Analyzer' | 'Trader'

export interface Role {
  id: string
  name: RoleName
  description: string
  created_at: string
}

export interface Profile {
  id: string
  email: string
  full_name: string
  role_id: string
  bio: string | null
  avatar_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  tutorial_completed?: boolean
  role?: Role
}

export interface Follow {
  id: string
  follower_id: string
  following_id: string
  created_at: string
}
