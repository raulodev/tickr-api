import {
  VerifyAuthProviderCredentials,
  type AuthCredentials,
} from './base-auth.provider.js';

export class GithubAuthProvider extends VerifyAuthProviderCredentials {
  async isCredentialsValid(data: AuthCredentials): Promise<boolean> {
    const { oAuthToken, email } = data;

    if (!oAuthToken) {
      return false;
    }

    try {
      const response = await fetch('https://api.github.com/user/emails', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${oAuthToken}`,
        },
      });

      if (!response.ok) {
        return false;
      }

      const emails: unknown = await response.json();

      return (
        Array.isArray(emails) &&
        emails.some(
          (githubEmail: unknown) =>
            typeof githubEmail === 'object' &&
            githubEmail !== null &&
            'email' in githubEmail &&
            'verified' in githubEmail &&
            githubEmail.email === email &&
            githubEmail.verified === true,
        )
      );
    } catch {
      return false;
    }
  }
}
