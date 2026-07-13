import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import {
  AuthorizationRequest,
  AuthorizationResponse,
  IPermissionsAdapter,
  Permission,
} from '../../models/permissions.model.js';
import {
  BatchCheckResponse,
  BatchCheckResult,
  BatchCheckTuple,
} from './models/open-fga.model.js';
import { StoreIdResolver } from './store-id.resolver.js';

// Standard k8s verbs used for UI capability checks when checkActions is 'All'
const K8S_VERBS = ['get', 'list', 'create', 'watch', 'delete', 'update', 'patch'];
const DEFAULT_NAMESPACE = 'default';

// Mirrors ResolveOnParent from rebac-authz-webhook:
// create/list/watch → check against parent object (account or namespace) with compound relation
// get/update/delete/patch → check against the resource object itself
function resolveOnParent(verb: string): boolean {
  return verb === 'create' || verb === 'list' || verb === 'watch';
}

// Mirrors buildObjectType from rebac-authz-webhook:
// converts dots to underscores but preserves dashes ("orchestrate.platform-mesh.io" → "orchestrate_platform-mesh_io")
// empty group (core k8s resources like Namespace) → "core"
function buildFgaGroup(k8sGroup: string): string {
  return k8sGroup ? k8sGroup.replace(/\./g, '_') : 'core';
}

// Normalizes apiGroup from resourceDefinition format to k8s group format:
// resourceDefinition uses underscores everywhere: "orchestrate_platform_mesh_io"
// k8s group uses dots and dashes: "orchestrate.platform-mesh.io"
function normalizeApiGroup(apiGroup: string): string {
  return apiGroup
    .replace(/platform_mesh/g, 'platform-mesh')
    .replace(/_/g, '.');
}

@Injectable()
export class OpenFgaAdapter implements IPermissionsAdapter {
  private readonly logger = new Logger(OpenFgaAdapter.name);
  private readonly storeIdResolver = new StoreIdResolver();

  constructor(
    private readonly httpService: HttpService,
    private readonly apiUrl: string,
  ) {}

  private extractUserIdentifier(token: string): string {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      return payload.email ?? '';
    } catch {
      return '';
    }
  }

  async checkPermissions(req: AuthorizationRequest): Promise<AuthorizationResponse> {
    const store = await this.storeIdResolver.resolve(req.organization);
    if (!store) {
      this.logger.warn(`No store found for org "${req.organization}" — skipping permissions`);
      return { accountPath: req.accountPath, permissions: [] };
    }

    const userIdentifier = this.extractUserIdentifier(req.token);
    const accountName = req.accountPath || req.organization;
    // FGA account object ID: {type}:{parentClusterID}/{accountName}
    // org-level: parentClusterID = originClusterId (parent workspace of the org)
    // sub-account: parentClusterID = generatedClusterId (the org workspace is parent of the sub-account)
    const accountClusterPrefix = accountName === req.organization
      ? store.originClusterId
      : store.generatedClusterId;
    const accountObject = `core_platform-mesh_io_account:${accountClusterPrefix}/${accountName}`;
    const namespaceObject = `core_namespace:${store.generatedClusterId}/${DEFAULT_NAMESPACE}`;

    const tuples: BatchCheckTuple[] = [];
    const correlationMap = new Map<string, { resource: string; action: string }>();

    for (const check of req.checks) {
      const k8sGroup = normalizeApiGroup(check.apiGroup);
      const fgaGroup = buildFgaGroup(k8sGroup);
      const resourcePlural = check.entityCollection.toLowerCase();
      const isNamespaced = check.scope === 'Namespaced';
      const actions = check.actions === 'All' ? K8S_VERBS : check.actions;

      for (const action of actions) {
        const correlationId = `${tuples.length}`;
        correlationMap.set(correlationId, { resource: check.resource, action });

        const relation = resolveOnParent(action)
          ? `${action}_${fgaGroup}_${resourcePlural}`
          : action;
        const checkObject = isNamespaced ? namespaceObject : accountObject;

        const tuple: BatchCheckTuple = {
          tuple_key: { user: `user:${userIdentifier}`, relation, object: checkObject },
          correlation_id: correlationId,
        };

        if (isNamespaced) {
          tuple.contextual_tuples = {
            tuple_keys: [{ object: namespaceObject, relation: 'parent', user: accountObject }],
          };
        }
        
        tuples.push(tuple);
      }
    }

    if (!tuples.length) {
      return { accountPath: req.accountPath, permissions: [] };
    }

    this.logger.debug(
      `batch-check → storeId=${store.storeId} user=${userIdentifier} tuples=${JSON.stringify(
        tuples.map((t) => ({
          user: t.tuple_key.user,
          relation: t.tuple_key.relation,
          object: t.tuple_key.object,
          contextual_tuples: t.contextual_tuples?.tuple_keys,
        })),
      )}`,
    );

    let results: Record<string, BatchCheckResult> = {};

    try {
      const response = await firstValueFrom(
        this.httpService.post<BatchCheckResponse>(
          `${this.apiUrl}/stores/${store.storeId}/batch-check`,
          {
            checks: tuples,
            ...(store.authorizationModelId && { authorization_model_id: store.authorizationModelId }),
          },
        ),
      );
      results = response.data.result ?? {};
      this.logger.debug(
        `batch-check ← ${JSON.stringify(Object.entries(results).map(([id, r]) => ({ id, allowed: r.allowed, error: (r as any).error })))}`,
      );
    } catch (err) {
      this.logger.error('OpenFGA batch-check failed', err);
      return { accountPath: req.accountPath, permissions: [] };
    }

    const permissionsMap = new Map<string, string[]>();
    for (const [correlationId, result] of Object.entries(results)) {
      if (!result.allowed) continue;
      const entry = correlationMap.get(correlationId);
      if (!entry) continue;
      const existingActions = permissionsMap.get(entry.resource) ?? [];
      existingActions.push(entry.action);
      permissionsMap.set(entry.resource, existingActions);
    }

    const permissions: Permission[] = Array.from(permissionsMap.entries()).map(
      ([resource, actions]) => ({ resource, actions }),
    );

    this.logger.log(`permissions resolved for "${req.accountPath}": ${JSON.stringify(permissions)}`);
    return { accountPath: req.accountPath, permissions };
  }
}
