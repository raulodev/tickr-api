import {
  VerifyAuthProviderCredentials,
  type AuthCredentials,
} from './base-auth.provider.js';

export class DefaultAuthProvider extends VerifyAuthProviderCredentials {
  async isCredentialsValid(data: AuthCredentials): Promise<boolean> {
    return false;
  }
}
