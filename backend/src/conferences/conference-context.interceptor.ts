import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { ConferencesService } from "./conferences.service";
import { AuthUser } from "../common/decorators";

/**
 * Resolves X-Conference-Id (or falls back to user's default con)
 * and attaches request.conferenceId for downstream services.
 */
@Injectable()
export class ConferenceContextInterceptor implements NestInterceptor {
  constructor(private conferences: ConferencesService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<{
      user?: AuthUser;
      headers: Record<string, string | string[] | undefined>;
      conferenceId?: string | null;
    }>();

    if (req.user) {
      const raw = req.headers["x-conference-id"];
      const headerId = Array.isArray(raw) ? raw[0] : raw;
      const resolved = await this.conferences.resolveConferenceId(
        req.user,
        headerId || null,
      );
      req.conferenceId = resolved;
      // Also expose on AuthUser for convenience
      if (req.user) {
        (req.user as AuthUser).conferenceId = resolved || undefined;
      }
    }

    return next.handle();
  }
}
