import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthMailService } from '../../src/auth/auth-mail.service.js';
import type { User } from '../../src/generated/prisma/client.js';
import { ResetPasswordMail } from '../../src/mail/mails/reset-password.mail.js';
import { VerifyEmailMail } from '../../src/mail/mails/verify-email.mail.js';

describe('AuthMailService', () => {
  const mailer = { send: vi.fn() };
  let service: AuthMailService;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('APP_URL', 'https://tickr.test');
    service = new AuthMailService(mailer as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('envía un correo de verificación con el enlace y el idioma solicitados', async () => {
    const user = {
      id: 'user-1',
      name: 'Ada',
      email: 'ada@test.com',
    } as User;

    await service.sendVerification(user, 'verify-token', 'es');

    expect(mailer.send).toHaveBeenCalledWith(VerifyEmailMail, {
      to: { name: 'Ada', address: 'ada@test.com' },
      data: {
        name: 'Ada',
        url: 'https://tickr.test/verify-email?token=verify-token',
      },
      locale: 'es',
    });
  });

  it('envía un correo de recuperación y usa un nombre vacío si falta', async () => {
    const user = {
      id: 'user-2',
      name: null,
      email: 'user@test.com',
    } as User;

    await service.sendPasswordReset(user, 'reset-token', 'en');

    expect(mailer.send).toHaveBeenCalledWith(ResetPasswordMail, {
      to: { name: '', address: 'user@test.com' },
      data: {
        name: '',
        url: 'https://tickr.test/reset-password?token=reset-token',
      },
      locale: 'en',
    });
  });

  it('registra el error y no propaga fallos del proveedor de correo', async () => {
    const user = {
      id: 'user-3',
      name: 'Grace',
      email: 'grace@test.com',
    } as User;
    const error = new Error('mailer unavailable');
    mailer.send.mockRejectedValue(error);
    const loggerError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    await expect(
      service.sendVerification(user, 'verify-token', 'es'),
    ).resolves.toBeUndefined();

    expect(loggerError).toHaveBeenCalledWith(
      `No se pudo enviar ${VerifyEmailMail.name} a user-3`,
      error,
    );
  });
});
