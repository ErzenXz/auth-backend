import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { StrategiesEnum } from '../enums/security-strategies.enum';

@Injectable()
export class LinkedInOAuthGuard extends AuthGuard(StrategiesEnum.LinkedIn) {}
