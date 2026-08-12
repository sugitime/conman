import { Controller, Get } from "@nestjs/common";
import { Public } from "./common/decorators";
import { PrismaService } from "./prisma/prisma.service";

@Controller()
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get("health")
  health() {
    return { ok: true, service: "conman-api" };
  }

  @Public()
  @Get("health/db")
  async db() {
    try {
      const users = await this.prisma.user.count();
      return { ok: true, users };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
