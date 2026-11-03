import { Injectable } from '@nestjs/common';
import { Mailable, MailRenderContext } from '@nestjs/mail';
import { I18nService } from 'nestjs-i18n';

export interface ActionMailData {
  name: string;
  url: string;
}

@Injectable()
export class VerifyEmailMail implements Mailable<ActionMailData> {
  constructor(private readonly i18n: I18nService) {}

  render({ name, url }: ActionMailData, { locale }: MailRenderContext) {
    return {
      subject: this.i18n.t('mail.VERIFY_EMAIL.subject', { lang: locale }),
      template: 'verify-email',
      context: { name, url },
    };
  }
}
