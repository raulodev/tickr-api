import {
  AuthProvider,
  VerifyAuthProviderCredentials,
} from './base-auth.provider.js';
import { DefaultAuthProvider } from './default-auth.provider.js';
import { GithubAuthProvider } from './github-auth.provider.js';

export class AuthProviderFactory {
  private static readonly providers: Record<
    AuthProvider,
    VerifyAuthProviderCredentials
  > = {
    GITHUB: new GithubAuthProvider(),
  };

  static getProvider(provider: string): VerifyAuthProviderCredentials {
    return (
      this.providers[provider as AuthProvider] ?? new DefaultAuthProvider()
    );
  }
}
