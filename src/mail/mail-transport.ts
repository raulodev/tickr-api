import {
  FileMailTransport,
  ResendTransport,
  SmtpTransport,
  type MailTransport,
  Duration,
} from '@nestjs/mail';

/**
 * The transport for this environment: `file` in development (the default), `smtp` or
 * `resend` in production. Missing settings fail at startup, naming the variable.
 */
export function mailTransport(
  env: NodeJS.ProcessEnv = process.env,
): MailTransport {
  switch (env.MAIL_TRANSPORT ?? 'file') {
    case 'file':
      return new FileMailTransport({
        directory: env.MAIL_DIRECTORY ?? 'var/mail',
      });
    case 'smtp':
      return new SmtpTransport({
        timeouts: {
          greeting: '1m' as Duration,
        },
        tls: {
          rejectUnauthorized:
            env.SMTP_REJECT_UNAUTHORIZED === 'true' ||
            !!!env.SMTP_REJECT_UNAUTHORIZED,
        },
        url: required(env, 'SMTP_URL'),
        pool: true,
      });
    case 'resend':
      return new ResendTransport({ apiKey: required(env, 'RESEND_API_KEY') });
    default:
      throw new Error(
        `MAIL_TRANSPORT must be "file", "smtp" or "resend" (got "${env.MAIL_TRANSPORT}")`,
      );
  }
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(
      `${name} is required when MAIL_TRANSPORT is "${env.MAIL_TRANSPORT}"`,
    );
  }
  return value;
}
