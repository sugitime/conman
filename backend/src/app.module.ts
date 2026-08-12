import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ServeStaticModule } from "@nestjs/serve-static";
import { join } from "path";
import { PrismaModule } from "./prisma/prisma.module";
import { MailModule } from "./mail/mail.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { PoliciesModule } from "./policies/policies.module";
import { SettingsModule } from "./settings/settings.module";
import { DepartmentsModule } from "./departments/departments.module";
import { OpsModule } from "./ops/ops.module";
import { InventoryModule } from "./inventory/inventory.module";
import { ProfilesModule } from "./profiles/profiles.module";
import { HealthController } from "./health.controller";
import {
  FeatureGuard,
  JwtAuthGuard,
  PermissionsGuard,
  RolesGuard,
} from "./common/guards";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath:
        process.env.UPLOAD_DIR || join(process.cwd(), "uploads"),
      serveRoot: "/uploads",
    }),
    PrismaModule,
    MailModule,
    AuthModule,
    UsersModule,
    PoliciesModule,
    SettingsModule,
    DepartmentsModule,
    InventoryModule,
    ProfilesModule,
    OpsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: FeatureGuard },
  ],
})
export class AppModule {}
