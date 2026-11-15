export const AuthProvider = {
  GITHUB: 'GITHUB',
} as const;

export type AuthProvider = (typeof AuthProvider)[keyof typeof AuthProvider];

export interface AuthCredentials {
  oAuthToken: string;
  email: string;
}

export abstract class VerifyAuthProviderCredentials {
  abstract isCredentialsValid(data: AuthCredentials): Promise<boolean>;
}
