import { defineStore } from 'pinia'

export const AuthStore = defineStore('auth', {
  state: () => ({
    IsLoggedIn: false,
    Cognito: {} as { username?: string; userId?: string; signInDetails?: { loginId?: string } },
  }),
  actions: {
    async setCognito(): Promise<void> {
      this.IsLoggedIn = false
      this.Cognito = {}
    },
    signOut(): void {
      if (this.Cognito.userId) {
        localStorage.removeItem(`cc_last_query_${this.Cognito.userId}`)
      }
      this.IsLoggedIn = false
      this.Cognito = {}
    },
  },
})
