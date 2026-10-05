import { createIdentifier } from '@toeverything/infra';

export interface SignInUserInfo {
  id: string;
  email: string;
  name: string;
  hasPassword: boolean | null;
  avatarUrl: string | null;
  emailVerified: boolean;
}

export interface SignUpUserInfo extends SignInUserInfo {
  /** the first account registered on a server becomes its administrator */
  isAdmin: boolean;
}

export interface SignUpCredential {
  email: string;
  password: string;
  name?: string;
  verifyToken?: string;
  challenge?: string;
}

export interface AuthProvider {
  signInMagicLink(
    email: string,
    token: string,
    clientNonce?: string
  ): Promise<void>;

  signInOauth(
    code: string,
    state: string,
    provider: string,
    clientNonce?: string
  ): Promise<{ redirectUri?: string }>;

  signInPassword(credential: {
    email: string;
    password: string;
    verifyToken?: string;
    challenge?: string;
  }): Promise<SignInUserInfo | void>;

  /**
   * Create an email + password account on the server (`/api/auth/sign-up`)
   * and sign in with it.
   */
  signUp(credential: SignUpCredential): Promise<SignUpUserInfo | void>;

  signInOpenAppSignInCode(code: string): Promise<void>;

  signOut(): Promise<void>;

  clearSession(): Promise<void>;
}

export const AuthProvider = createIdentifier<AuthProvider>('AuthProvider');
