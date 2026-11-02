import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser } from './auth-user.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto, RefreshTokenDto } from './dto/refresh.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { SwitchTenantDto } from './dto/switch-tenant.dto.js';

const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };
const REFRESH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Throttle(AUTH_THROTTLE)
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() req: any) {
    return req.user;
  }

  @UseGuards(AuthGuard)
  @Post('switch-tenant')
  @HttpCode(200)
  switchTenant(@Req() req: any, @Body() dto: SwitchTenantDto) {
    return this.auth.switchTenant(req.user.sub, dto.tenantId);
  }

  @Throttle(REFRESH_THROTTLE)
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto);
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Body() dto: RefreshTokenDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @UseGuards(AuthGuard)
  @Post('logout-all')
  @HttpCode(204)
  logoutAll(@CurrentUser() user: AuthUser) {
    return this.auth.logoutAll(user.sub);
  }
}
