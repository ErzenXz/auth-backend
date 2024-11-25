import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { StrategiesEnum } from '../enums/security-strategies.enum';

@Injectable()
export class GoogleOAuthGuard extends AuthGuard(StrategiesEnum.Google) {}
