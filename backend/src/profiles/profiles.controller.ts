import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { ShirtSize } from "@prisma/client";
import { ProfilesService } from "./profiles.service";
import { AuthUser, CurrentUser, RequireFeature } from "../common/decorators";

@Controller()
export class ProfilesController {
  constructor(private profiles: ProfilesService) {}

  @Get("profile")
  me(@CurrentUser() user: AuthUser) {
    return this.profiles.getProfile(user.id, user);
  }

  @Get("profile/:id")
  get(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.profiles.getProfile(id, user);
  }

  @Patch("profile")
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body()
    body: Partial<{
      name: string;
      phone: string;
      title: string;
      pronouns: string;
      hotelCheckIn: string | null;
      hotelCheckOut: string | null;
      roommateId: string | null;
      shirtSize: ShirtSize | null;
      emergencyName: string | null;
      emergencyPhone: string | null;
      dietaryNotes: string | null;
      medicalNotes: string | null;
    }>,
  ) {
    return this.profiles.updateProfile(user.id, user, body);
  }

  @Patch("profile/:id")
  update(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.profiles.updateProfile(id, user, body as never);
  }

  @Get("profile-roommates")
  roommates(@CurrentUser() user: AuthUser) {
    return this.profiles.roommateOptions(user.id, user.departmentIds);
  }

  @Get("staff-directory")
  @RequireFeature("staff_lists")
  directory(
    @CurrentUser() user: AuthUser,
    @Query("private") priv?: string,
  ) {
    return this.profiles.staffDirectory(user, priv === "1" || priv === "true");
  }
}
