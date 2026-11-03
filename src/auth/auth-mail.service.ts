import { Injectable, Logger, Type } from '@nestjs/common';
import { User } from '../generated/prisma/client.js';
import {
  ActionMailData,
  VerifyEmailMail,
} from '../mail/mails/verify-email.mail.js';
import { Mailable, Mailer } from '@nestjs/mail';
import { ResetPasswordMail } from '../mail/mails/reset-password.mail.js';

@Injectable()
export class AuthMailService {
  private readonly logger = new Logger(AuthMailService.name);
  private readonly appUrl = process.env.APP_URL!;

  constructor(private readonly mailer: Mailer) {}

  async sendVerification(user: User, token: string, locale: string) {
    await this.send(
      VerifyEmailMail,
      user,
      `${this.appUrl}/verify-email?token=${token}`,
      locale,
    );
  }

  async sendPasswordReset(user: User, token: string, locale: string) {
    await this.send(
      ResetPasswordMail,
      user,
      `${this.appUrl}/reset-password?token=${token}`,
      locale,
    );
  }

  private async send(
    mail: Type<Mailable<ActionMailData>>,
    user: User,
    url: string,
    locale: string,
  ) {
    try {
      await this.mailer.send(mail, {
        to: { name: user.name ?? '', address: user.email },
        data: { name: user.name ?? '', url },
        locale,
      });
    } catch (error) {
      this.logger.error(`No se pudo enviar ${mail.name} a ${user.id}`, error);
    }
  }
}
