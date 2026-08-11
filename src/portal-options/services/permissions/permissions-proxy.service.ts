import { Injectable } from '@nestjs/common';
import { ContentConfiguration } from '@openmfp/portal-server-lib';
import { extractResourceDefinitions } from '../../utils/extract-resource-definitions.util.js';
import { AuthzWebhookService } from './adapters/authz-webhook.service.js';
import {
  AuthorizationRequest,
  Permission,
  PermissionsDefinition,
} from './models/permissions.model.js';

@Injectable()
export class PermissionsProxyService {
  constructor(private readonly authzWebhook: AuthzWebhookService) {}

  // Tier 1 — called by KubernetesServiceProvidersService / ContentConfigurationServiceProvidersService
  async resolvePermissions(
    token: string,
    organization: string,
    accountPath: string,
    contentConfigurations: ContentConfiguration[],
  ): Promise<Permission[] | undefined> {
    const resourceDefinitions = extractResourceDefinitions(
      contentConfigurations,
    );

    const checks = resourceDefinitions
      .map((rd) => rd.permissionsDefinition)
      .filter(
        (pd): pd is PermissionsDefinition =>
          !!pd && pd.resourceActions.length > 0,
      )
      .map((pd) => ({
        resource: pd.resource,
        group: pd.group,
        actions: pd.resourceActions,
      }));

    if (!checks.length) {
      return undefined;
    }

    const req: AuthorizationRequest = {
      token,
      organization,
      accountPath,
      checks,
    };

    return this.authzWebhook.checkActionsForResource(req);
  }

  // Tier 2 — called by PermissionsController
  async checkResourceInstance(
    req: AuthorizationRequest,
  ): Promise<Permission[] | undefined> {
    return this.authzWebhook.checkActionsForInstance(req);
  }
}
