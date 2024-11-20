import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Service for managing database connections using Prisma.
 *
 * This service extends the `PrismaClient` to provide lifecycle hooks for
 * connecting and disconnecting from the database when the module is initialized
 * and destroyed. It implements the `OnModuleInit` and `OnModuleDestroy`
 * interfaces to manage the database connection lifecycle.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  /**
   * Called when the module is initialized.
   *
   * This method establishes a connection to the database by invoking the
   * `$connect` method of the `PrismaClient`.
   */
  async onModuleInit() {
    await this.$connect();
  }

  /**
   * Called when the module is destroyed.
   *
   * This method disconnects from the database by invoking the `$disconnect`
   * method of the `PrismaClient`, ensuring that all resources are properly
   * released.
   */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
