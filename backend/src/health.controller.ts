import { Controller, Get } from "@nestjs/common";
import { Public } from "./common/decorators";

@Controller()
export class HealthController {
  @Public()
  @Get("health")
  health() {
    return { ok: true, service: "conman-api" };
  }
}
