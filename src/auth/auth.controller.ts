import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dtos';
import { Request, Response } from 'express';
import { Auth } from './decorators/auth.decorator';
import { HttpContext } from './decorators/headers.decorator';
import type { HttpContext as IHttpContext } from './models/http.model';
import { MfaDto } from './dtos/mfa.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(
    @Body() registerRequest: RegisterDto,
    @HttpContext()
    context: IHttpContext,
  ) {
    return this.authService.register(registerRequest, context);
  }

  @Post('login')
  async login(
    @Body() loginRequest: LoginDto,
    @HttpContext() context: IHttpContext,
  ) {
    return this.authService.login(loginRequest, context);
  }

  @Get('info')
  async me(@HttpContext() req: IHttpContext) {
    return this.authService.info(req);
  }

  @Post('refresh')
  async refresh(@HttpContext() req: IHttpContext) {
    return this.authService.refresh(req);
  }

  @Post('logout')
  async logout(@HttpContext() req: IHttpContext) {
    return this.authService.logout(req);
  }

  @Post('mfa/setup')
  async setupMfa(@HttpContext() req: IHttpContext, @Body() code: string) {
    return this.authService.setupMfa(req, code);
  }

  @Post('mfa/verify')
  async verifyMfa(
    @Body() mfaRequest: MfaDto,
    @HttpContext() req: IHttpContext,
  ) {
    return this.authService.verifyMfa(mfaRequest, req);
  }
}
