import { Injectable, Logger } from '@nestjs/common';
import { ContentConfiguration } from '@openmfp/portal-server-lib';
import { extractResourceDefinitions } from './extract-resource-definitions.util.js';
import {
  AuthorizationRequest,
  Permission
} from './permissions.model.js';

@Injectable()
export class PermissionsProxyService {
  private readonly logger = new Logger(PermissionsProxyService.name);

  async resolvePermissions(
    token: string,
    userId: string,
    accountPath: string,
    contentConfigurations: ContentConfiguration[],
  ): Promise<Permission[] | undefined> {
    const checks = extractResourceDefinitions(contentConfigurations);
    if (!checks.length) {
      return;
    }

    const req: AuthorizationRequest = {
      userId,
      accountPath,
      checks,
    };

    this.logger.warn(
      `PermissionsProxyService: no adapter configured — returning stub permissions (all allowed) for ${req.userId} on ${req.accountPath}`,
    );
    const defaultVerbs = ['get', 'list', 'create', 'update', 'delete', 'watch'];
    return req.checks.map((check) => ({
      resource: check.resource,
      actions: check.actions === 'All' ? defaultVerbs : check.actions,
    }));
  }
}
