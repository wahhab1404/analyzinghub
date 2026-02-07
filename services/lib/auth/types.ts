import { Profile, RoleName } from '../types/database'

export interface AnalyzerStats {
  total_analyses: number
  active_analyses: number
  completed_analyses: number
  successful_analyses: number
  success_rate: number
  followers_count: number
  following_count: number
}

export interface SessionUser {
  id: string
  email: string
  profile: Profile
  role: RoleName
  stats?: AnalyzerStats
  tutorial_completed?: boolean
}
