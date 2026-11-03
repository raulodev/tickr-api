import { Injectable } from '@nestjs/common';
import { Mailable, MailRenderContext } from '@nestjs/mail';
import { I18nService } from 'nestjs-i18n';

export interface ActionMailData {
  name: string;
  url: string;
}

@Injectable()
export class ResetPasswordMail implements Mailable<ActionMailData> {
  constructor(private readonly i18n: I18nService) {}

  render({ name, url }: ActionMailData, { locale }: MailRenderContext) {
    return {
      subject: this.i18n.t('mail.RESET_PASSWORD.subject', { lang: locale }),
      template: 'reset-password',
      context: { name, url },
    };
  }
}
