import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { HeaderParserService } from '@openmfp/portal-server-lib';
import { AuthzWebhookService } from '../permissions/adapters/authz-webhook.service.js';

const ACCOUNTS_RESOURCE = 'accounts';
const ACCOUNTS_GROUP = '';
const DELETE_VERB = 'delete';

// Interim check: owner of root:orgs (delete on accounts) maps to platform-admin.
// Replace with platform_admin FGA relation once issue #432 lands.
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  private readonly logger = new Logger(PlatformAdminGuard.name);

  constructor(
    private readonly authzWebhook: AuthzWebhookService,
    private readonly headerParser: HeaderParserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.headerParser.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    // checkActionsForInstance returns undefined when no webhook URL is configured
    const permissions = await this.authzWebhook.checkActionsForInstance({
      token,
      // Empty strings → buildWorkspacePath skips them → root:orgs
      organization: '',
      accountPath: '',
      checks: [
        {
          resource: ACCOUNTS_RESOURCE,
          group: ACCOUNTS_GROUP,
          actions: [DELETE_VERB],
        },
      ],
    });

    if (!permissions) {
      this.logger.warn('Platform-admin authz check returned no permissions — webhook may be unavailable');
      throw new ForbiddenException();
    }

    const hasAccess = permissions.some(
      (p) => p.resource === ACCOUNTS_RESOURCE && p.actions.includes(DELETE_VERB),
    );

    if (!hasAccess) {
      this.logger.debug('Platform-admin access denied for request');
      throw new ForbiddenException();
    }

    return true;
  }
}
