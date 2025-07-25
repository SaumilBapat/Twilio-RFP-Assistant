export interface User {
  id: string;
  email: string;
  name: string;
  googleId?: string;
}

export class AuthService {
  private user: User | null = null;

  getCurrentUser(): User | null {
    return this.user;
  }

  setCurrentUser(user: User | null): void {
    this.user = user;
  }

  async signInWithGoogle(): Promise<User> {
    // This would integrate with Google Identity Services
    // For now, return a mock user for development
    const mockUser: User = {
      id: 'user-1',
      email: 'sarah.chen@twilio.com',
      name: 'Sarah Chen'
    };
    
    this.setCurrentUser(mockUser);
    return mockUser;
  }

  async signOut(): Promise<void> {
    this.user = null;
  }

  isAuthenticated(): boolean {
    return this.user !== null;
  }
}

export const authService = new AuthService();
