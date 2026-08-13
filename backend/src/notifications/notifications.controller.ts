import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { IsObject, IsOptional } from "class-validator";
import { NotificationsService } from "./notifications.service";
import { AuthUser, CurrentUser } from "../common/decorators";
import { NotificationPrefs } from "./notification-prefs";

class UpdatePrefsDto {
  @IsOptional()
  @IsObject()
  channels?: { inApp?: boolean; email?: boolean };

  @IsOptional()
  @IsObject()
  events?: NotificationPrefs["events"];
}

@Controller("notifications")
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("unreadOnly") unreadOnly?: string,
  ) {
    return this.notifications.list(user.id, {
      unreadOnly: unreadOnly === "1" || unreadOnly === "true",
    });
  }

  @Get("unread-count")
  async unreadCount(@CurrentUser() user: AuthUser) {
    const count = await this.notifications.unreadCount(user.id);
    return { count };
  }

  @Get("prefs")
  getPrefs(@CurrentUser() user: AuthUser) {
    return this.notifications.getPrefs(user.id);
  }

  @Get("catalog")
  catalog() {
    return this.notifications.catalog();
  }

  @Patch("prefs")
  updatePrefs(@CurrentUser() user: AuthUser, @Body() dto: UpdatePrefsDto) {
    return this.notifications.updatePrefs(user.id, {
      channels: dto.channels
        ? {
            inApp: dto.channels.inApp !== false,
            email: !!dto.channels.email,
          }
        : undefined,
      events: dto.events,
    });
  }

  @Post("read-all")
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post(":id/read")
  markRead(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.notifications.markRead(user.id, id);
  }
}
