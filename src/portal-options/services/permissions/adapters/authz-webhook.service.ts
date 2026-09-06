import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { buildWorkspacePath } from '../../../utils/build-workspace-path.util.js';
import { AuthorizationRequest, IAuthzService, Permission, SubjectAccessReview } from '../models/permissions.model.js';

// Server default for the cluster-path extra key (flag --webhook-cluster-path-key,
// see rebac-authz-webhook pkg/config/config.go).
const CLUSTER_PATH_KEY = 'authorization.kubernetes.io/cluster-path';

interface BatchAuthzResult {
  id: string;
  allowed: boolean;
}

@Injectable()
export class AuthzWebhookService implements IAuthzService {
  private readonly logger = new Logger(AuthzWebhookService.name);
  private readonly webhookUrl: string | undefined;

  constructor(private readonly httpService: HttpService) {
    this.webhookUrl = process.env['OPENMFP_PORTAL_CONTEXT_AUTHZ_WEBHOOK_URL'];
    if (!this.webhookUrl) {
      this.logger.warn(
        'OPENMFP_PORTAL_CONTEXT_AUTHZ_WEBHOOK_URL not set — permissions checks are disabled (fail-open)',
      );
    }
  }

  // Tier 1: batch check for all resource types at startup
  async checkActionsForResource(
    req: AuthorizationRequest,
  ): Promise<Permission[] | undefined> {
    if (!this.webhookUrl) {
      return undefined;
    }

    const user = this.extractUserEmail(req.token);
    const clusterPath = buildWorkspacePath([req.organization, req.accountPath]);

    const items: SubjectAccessReview[] = [];
    const correlationMap = new Map<string, { resource: string; verb: string }>();

    for (const check of req.checks) {
      for (const verb of check.actions) {
        const id = randomUUID();
        correlationMap.set(id, { resource: check.resource, verb });
        items.push({
          apiVersion: 'authorization.k8s.io/v1',
          kind: 'SubjectAccessReview',
          metadata: { name: id },
          spec: {
            user,
            extra: { [CLUSTER_PATH_KEY]: [clusterPath] },
            resourceAttributes: {
              verb,
              group: check.group,
              resource: check.resource.toLowerCase(),
            },
          },
        });
      }
    }

    if (!items.length) {
      return undefined;
    }

    const results = await this.sendBatch(items);
    if (!results) {
      return undefined;
    }

    const permissions = this.mapToPermissions(results, correlationMap);
    this.logger.log(
      `permissions resolved for "${user}" "${clusterPath}": ${JSON.stringify(permissions)}`,
    );
    return permissions;
  }

  // Tier 2: check specific verbs on concrete resource instances
  async checkActionsForInstance(
    req: AuthorizationRequest,
  ): Promise<Permission[] | undefined> {
    if (!this.webhookUrl) {
      return undefined;
    }

    const user = this.extractUserEmail(req.token);
    const clusterPath = buildWorkspacePath([req.organization, req.accountPath]);

    const items: SubjectAccessReview[] = [];
    const correlationMap = new Map<
      string,
      { resource: string; namespace?: string; name?: string; verb: string }
    >();

    for (const check of req.checks) {
      for (const verb of check.actions) {
        const id = randomUUID();
        correlationMap.set(id, {
          resource: check.resource,
          ...(check.namespace ? { namespace: check.namespace } : {}),
          ...(check.name ? { name: check.name } : {}),
          verb,
        });
        items.push({
          apiVersion: 'authorization.k8s.io/v1',
          kind: 'SubjectAccessReview',
          metadata: { name: id },
          spec: {
            user,
            extra: { [CLUSTER_PATH_KEY]: [clusterPath] },
            resourceAttributes: {
              verb,
              group: check.group,
              resource: check.resource.toLowerCase(),
              // Namespaced when a namespace is present; cluster-scoped otherwise.
              namespace: check.namespace,
              name: check.name,
            },
          },
        });
      }
    }

    if (!items.length) {
      return undefined;
    }

    const results = await this.sendBatch(items);
    if (!results) {
      return undefined;
    }

    return this.mapToInstancePermissions(results, correlationMap);
  }

  private extractUserEmail(token: string): string {
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString(),
      );
      return payload.email ?? '';
    } catch {
      return '';
    }
  }

  private async sendBatch(
    items: SubjectAccessReview[],
  ): Promise<Record<string, boolean> | undefined> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<BatchAuthzResult[]>(
          `${this.webhookUrl}/batch-authz`,
          items,
          {
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      const results = Array.isArray(response.data) ? response.data : [];
      return results.reduce<Record<string, boolean>>((acc, result) => {
        acc[result.id] = result.allowed;
        return acc;
      }, {});
    } catch (err) {
      this.logger.error('authz-webhook batch-authz failed — failing open', err);
      return undefined;
    }
  }

  private mapToPermissions(
    results: Record<string, boolean>,
    correlationMap: Map<string, { resource: string; verb: string }>,
  ): Permission[] {
    const permissionsMap = new Map<string, string[]>();

    for (const [id, allowed] of Object.entries(results)) {
      if (!allowed) {
        continue;
      }

      const entry = correlationMap.get(id);
      if (!entry) {
        continue;
      }

      const actions = permissionsMap.get(entry.resource) ?? [];
      actions.push(entry.verb);
      permissionsMap.set(entry.resource, actions);
    }

    return Array.from(permissionsMap.entries()).map(([resource, actions]) => ({
      resource,
      actions,
    }));
  }

  private mapToInstancePermissions(
    results: Record<string, boolean>,
    correlationMap: Map<
      string,
      { resource: string; namespace?: string; name?: string; verb: string }
    >,
  ): Permission[] {
    const permissionsMap = new Map<
      string,
      { resource: string; namespace?: string; name?: string; actions: string[] }
    >();

    for (const [id, allowed] of Object.entries(results)) {
      if (!allowed) {
        continue;
      }

      const entry = correlationMap.get(id);
      if (!entry) {
        continue;
      }

      const key = `${entry.resource}|${entry.namespace ?? ''}|${entry.name ?? ''}`;
      const permission = permissionsMap.get(key) ?? {
        resource: entry.resource,
        ...(entry.namespace ? { namespace: entry.namespace } : {}),
        ...(entry.name ? { name: entry.name } : {}),
        actions: [],
      };
      permission.actions.push(entry.verb);
      permissionsMap.set(key, permission);
    }

    return Array.from(permissionsMap.values());
  }
}
