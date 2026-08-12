import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log("Database connected");
    } catch (err) {
      // Don't crash the process — Render needs PORT bound; retries can succeed later
      this.logger.error(`Database connect failed: ${String(err)}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
