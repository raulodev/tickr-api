import { I18nContext } from 'nestjs-i18n';

export const t = (key: string, args?: Record<string, unknown>): string =>
  I18nContext.current()?.t(key, { args }) ?? key;
