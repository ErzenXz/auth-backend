import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dtos';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { JwtSecurity } from './security';
import { RolesGuard } from './guards/roles.security.jwt';
import { Roles } from './decorators/roles.decorator';
import { Role } from './enums';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() registerRequest: RegisterDto) {
    return this.authService.register(registerRequest);
  }

  @Post('login')
  async login(@Body() loginRequest: LoginDto) {
    return this.authService.login(loginRequest);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.USER)
  @Get('me')
  async me(@Req() req: Request) {
    //console.log('req', req.user);
    // return this.authService.me(req);
    return 'me';
  }
}
