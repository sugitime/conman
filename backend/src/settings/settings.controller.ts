import { Body, Controller, Get, Post, Put } from "@nestjs/common";
import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";
import { SettingsService } from "./settings.service";
import {
  CurrentConferenceId,
  RequirePermissions,
} from "../common/decorators";

class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  conferenceName?: string;

  @IsOptional()
  @IsNumber()
  hotelSoloNightLimit?: number;

  @IsOptional()
  @IsNumber()
  hotelRoommateNightLimit?: number;

  @IsOptional()
  @IsString()
  smtpHost?: string | null;

  @IsOptional()
  @IsNumber()
  smtpPort?: number;

  @IsOptional()
  @IsString()
  smtpUser?: string | null;

  @IsOptional()
  @IsString()
  smtpPassword?: string | null;

  @IsOptional()
  @IsString()
  smtpFrom?: string | null;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsObject()
  globalFeatures?: Record<string, boolean>;
}

class TestSmtpDto {
  @IsEmail()
  to!: string;
}

@Controller("settings")
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @Get()
  get(@CurrentConferenceId() conferenceId: string | null) {
    return this.settings.get(conferenceId);
  }

  @Put()
  @RequirePermissions("settings.manage")
  update(
    @Body() dto: UpdateSettingsDto,
    @CurrentConferenceId() conferenceId: string | null,
  ) {
    return this.settings.update(dto, conferenceId);
  }

  @Post("test-smtp")
  @RequirePermissions("settings.manage")
  testSmtp(@Body() dto: TestSmtpDto) {
    return this.settings.testSmtp(dto.to);
  }
}
