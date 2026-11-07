import { type TestingModuleBuilder } from '@nestjs/testing';
import { vi } from 'vitest';
import { AuthMailService } from '../src/auth/auth-mail.service.js';

export const overrideAuthMail = (moduleBuilder: TestingModuleBuilder) =>
  moduleBuilder.overrideProvider(AuthMailService).useValue({
    sendVerification: vi.fn(),
    sendPasswordReset: vi.fn(),
  });
