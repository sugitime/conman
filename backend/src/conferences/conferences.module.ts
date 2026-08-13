import { Global, Module } from "@nestjs/common";
import { ConferencesService } from "./conferences.service";
import { ConferencesController } from "./conferences.controller";
import { ConferenceContextInterceptor } from "./conference-context.interceptor";

@Global()
@Module({
  controllers: [ConferencesController],
  providers: [ConferencesService, ConferenceContextInterceptor],
  exports: [ConferencesService, ConferenceContextInterceptor],
})
export class ConferencesModule {}
