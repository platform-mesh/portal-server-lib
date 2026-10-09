import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { HeaderParserService } from '@openmfp/portal-server-lib';
import { AuthzWebhookService } from '../permissions/adapters/authz-webhook.service.js';

const ORGS_ACCOUNT_GROUP = 'core.platform-mesh.io';
const ORGS_ACCOUNT_RESOURCE = 'accounts';

// INTERIM: Platform Administrator is currently identified as the owner of the
// root:orgs account. In the FGA core module `delete` on an account maps to the
// `owner` relation, so probing `delete accounts` at the root:orgs cluster path
// checks ownership. Replace with proper platform_admin role check once
// https://github.com/platform-mesh/backlog/issues/432 is resolved.
const OWNER_PROBE_VERB = 'delete';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(
    private readonly headerParser: HeaderParserService,
    private readonly authz: AuthzWebhookService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.headerParser.extractBearerToken(request);
    if (!token) throw new UnauthorizedException();
    const permissions = await this.authz.checkActionsForResource({
      token,
      organization: '',
      accountPath: '',
      checks: [
        {
          resource: ORGS_ACCOUNT_RESOURCE,
          group: ORGS_ACCOUNT_GROUP,
          actions: [OWNER_PROBE_VERB],
        },
      ],
    });
    if (permissions === undefined) return true;
    const allowed = permissions.some(
      p =>
        p.resource === ORGS_ACCOUNT_RESOURCE &&
        p.actions.includes(OWNER_PROBE_VERB),
    );
    if (!allowed) throw new ForbiddenException('Platform administrator role required');
    return true;
  }
}
