import { Injectable } from '@nestjs/common';
import { ContentConfiguration } from '@openmfp/portal-server-lib';
import { extractResourceDefinitions } from '../../utils/extract-resource-definitions.util.js';
import { AuthzWebhookService } from './adapters/authz-webhook.service.js';
import {
  AuthorizationRequest,
  Permission
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
      .filter((rd) => rd.checkActionsForResource !== undefined)
      .map((rd) => ({
        resource: rd.entity,
        apiGroup: rd.apiGroup ?? '',
        entityCollection: rd.entityCollection ?? '',
        version: rd.version ?? 'v1',
        scope: rd.scope ?? 'Cluster',
        namespace: rd.namespace,
        actions: rd.checkActionsForResource ?? [],
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
