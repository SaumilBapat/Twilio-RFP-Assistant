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

  async signInWithCredentials(username: string, password: string): Promise<User> {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      throw new Error('Invalid credentials');
    }

    const data = await response.json();
    this.setCurrentUser(data.user);
    return data.user;
  }

  async signInWithGoogle(): Promise<User> {
    // Redirect to Google OAuth
    window.location.href = '/api/auth/google';
    // This won't return since we're redirecting
    throw new Error('Redirecting to Google OAuth');
  }

  async signOut(): Promise<void> {
    await fetch('/api/logout');
    this.user = null;
  }

  isAuthenticated(): boolean {
    return this.user !== null;
  }
}

export const authService = new AuthService();
