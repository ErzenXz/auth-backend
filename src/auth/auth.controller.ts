import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  Res,
  Patch,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, LoginDto, RegisterDto } from './dtos';
import { Auth } from './decorators/auth.decorator';
import { HttpContext } from './decorators/headers.decorator';
import type { HttpContext as IHttpContext } from './models/http.model';
import { MfaDto } from './dtos/mfa.dto';
import { ApiTags } from '@nestjs/swagger';
import { ChangePasswordDto } from './dtos/change.password.dto';

@ApiTags('Authentication')
@Controller({
  path: 'auth',
  version: '1',
})
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
  async setupMfa(@HttpContext() req: IHttpContext) {
    return this.authService.generateQrCode(req);
  }

  @Post('mfa/setup/verify')
  async setupMfaSecond(@HttpContext() req: IHttpContext, @Body() code: string) {
    return this.authService.verifyMfaCode(req, code);
  }

  @Post('mfa/verify')
  async verifyMfa(
    @Body() mfaRequest: MfaDto,
    @HttpContext() req: IHttpContext,
  ) {
    return this.authService.verifyMfa(mfaRequest, req);
  }

  @Auth()
  @Patch('mfa/disable')
  async disableMfa(@HttpContext() req: IHttpContext) {
    return this.authService.disableMfa(req);
  }

  @Post('reset-password')
  async resetPassword(@Body() forgotDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotDto);
  }

  @Get('reset-password/verify/:token')
  async verifyResetPassword(@HttpContext() context: IHttpContext) {
    return this.authService.resetPassword(context);
  }

  @Patch('change-password')
  @Auth()
  async changePassword(
    @HttpContext() req: IHttpContext,
    @Body() changeDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(req, changeDto);
  }
}
