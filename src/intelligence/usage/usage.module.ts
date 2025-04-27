import { Module } from '@nestjs/common';
import { UsageService } from './usage.service';
import { UsageController } from './usage.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { UserModule } from '../../user/user.module';

@Module({
  imports: [PrismaModule, UserModule],
  controllers: [UsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
