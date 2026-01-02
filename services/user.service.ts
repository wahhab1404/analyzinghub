import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types/database'

export class UserService {
  private supabase = createClient()

  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select(`
        *,
        role:roles(*)
      `)
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Error fetching profile:', error)
      return null
    }

    return data
  }

  async updateProfile(userId: string, updates: Partial<Profile>) {
    const { data, error } = await this.supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data
  }

  async followUser(followingId: string) {
    const { data: { user } } = await this.supabase.auth.getUser()

    if (!user) {
      throw new Error('Not authenticated')
    }

    const { data, error } = await this.supabase
      .from('follows')
      .insert({
        follower_id: user.id,
        following_id: followingId,
      })
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data
  }

  async unfollowUser(followingId: string) {
    const { data: { user } } = await this.supabase.auth.getUser()

    if (!user) {
      throw new Error('Not authenticated')
    }

    const { error } = await this.supabase
      .from('follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', followingId)

    if (error) {
      throw new Error(error.message)
    }
  }

  async getFollowers(userId: string) {
    const { data, error } = await this.supabase
      .from('follows')
      .select(`
        *,
        follower:profiles!follower_id(*)
      `)
      .eq('following_id', userId)

    if (error) {
      throw new Error(error.message)
    }

    return data
  }

  async getFollowing(userId: string) {
    const { data, error } = await this.supabase
      .from('follows')
      .select(`
        *,
        following:profiles!following_id(*)
      `)
      .eq('follower_id', userId)

    if (error) {
      throw new Error(error.message)
    }

    return data
  }
}

export const userService = new UserService()
