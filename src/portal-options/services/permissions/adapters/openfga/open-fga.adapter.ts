import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
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

@Injectable()
export class OpenFgaAdapter implements IPermissionsAdapter {
  private readonly logger = new Logger(OpenFgaAdapter.name);
  private readonly k8sVerbs = ['get', 'list', 'create', 'watch', 'delete', 'update', 'patch'];
  private readonly defaultNamespace = 'default';

  constructor(
    private readonly httpService: HttpService,
    private readonly apiUrl: string,
    private readonly storeIdResolver = new StoreIdResolver(),
  ) {}

  async checkPermissions(req: AuthorizationRequest): Promise<AuthorizationResponse> {
    const store = await this.storeIdResolver.resolve(req.organization);
    if (!store) {
      this.logger.warn(`No store found for org "${req.organization}" — skipping permissions`);
      return { accountPath: req.accountPath, permissions: [] };
    }

    const userIdentifier = this.extractUserIdentifier(req.token);
    const accountObject = this.buildAccountObject(req, store);
    const { tuples, correlationMap } = this.buildTuples(req.checks, userIdentifier, accountObject, store.generatedClusterId);

    if (!tuples.length) {
      return { accountPath: req.accountPath, permissions: [] };
    }

    const results = await this.sendBatchCheck(tuples, store);
    if (!results) {
      return { accountPath: req.accountPath, permissions: [] };
    }

    const permissions = this.mapResultsToPermissions(results, correlationMap);
    this.logger.log(`permissions resolved for "${req.accountPath}": ${JSON.stringify(permissions)}`);
    return { accountPath: req.accountPath, permissions };
  }

  private buildAccountObject(req: AuthorizationRequest, store: { originClusterId: string; generatedClusterId: string }): string {
    const accountName = req.accountPath || req.organization;
    // org-level (accountPath is empty): parentClusterID = originClusterId (parent of the org workspace)
    // sub-account (accountPath is non-empty): parentClusterID = generatedClusterId (the org workspace
    //   is the parent of the sub-account workspace)
    // NOTE: do NOT compare accountName === organization — a sub-account may share the org's name.
    const clusterPrefix = !req.accountPath ? store.originClusterId : store.generatedClusterId;
    return `core_platform-mesh_io_account:${clusterPrefix}/${accountName}`;
  }

  private buildTuples(
    checks: AuthorizationRequest['checks'],
    userIdentifier: string,
    accountObject: string,
    generatedClusterId: string,
  ): { tuples: BatchCheckTuple[]; correlationMap: Map<string, { resource: string; action: string }> } {
    const tuples: BatchCheckTuple[] = [];
    const correlationMap = new Map<string, { resource: string; action: string }>();

    for (const check of checks) {
      const namespace = check.namespace ?? this.defaultNamespace;
      const actions = check.actions === 'All' ? this.k8sVerbs : check.actions;

      const config = {
        fgaGroup: this.buildFgaGroup(check.apiGroup),
        resourcePlural: check.entityCollection.toLowerCase(),
        isNamespaced: check.scope === 'Namespaced',
        namespaceObject : `core_namespace:${generatedClusterId}/${namespace}`,
        namespace,
        userIdentifier,
        accountObject,
      }

      for (const action of actions) {
        const correlationId = randomUUID();
        correlationMap.set(correlationId, { resource: check.resource, action });
        tuples.push(this.buildTuple(config, correlationId, action));
      }
    }

    return { tuples, correlationMap };
  }

  private buildTuple(config: {
    userIdentifier: string,
    fgaGroup: string,
    resourcePlural: string,
    isNamespaced: boolean,
    accountObject: string,
    namespaceObject: string,
  }, correlationId: string, action: string): BatchCheckTuple {
    const relation = this.resolveOnParent(action)
      ? `${action}_${config.fgaGroup}_${config.resourcePlural}`
      : action;
    const checkObject = config.isNamespaced ? config.namespaceObject : config.accountObject;

    const tuple: BatchCheckTuple = {
      tuple_key: { user: `user:${config.userIdentifier}`, relation, object: checkObject },
      correlation_id: correlationId,
    };

    if (config.isNamespaced) {
      tuple.contextual_tuples = {
        tuple_keys: [{ object: config.namespaceObject, relation: 'parent', user: config.accountObject }],
      };
    }

    return tuple;
  }

  private async sendBatchCheck(
    tuples: BatchCheckTuple[],
    store: { storeId: string; authorizationModelId: string },
  ): Promise<Record<string, BatchCheckResult> | null> {
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
      const results = response.data.result ?? {};

      return results;
    } catch (err) {
      this.logger.error('OpenFGA batch-check failed', err);
      return null;
    }
  }

  private mapResultsToPermissions(
    results: Record<string, BatchCheckResult>,
    correlationMap: Map<string, { resource: string; action: string }>,
  ): Permission[] {
    const permissionsMap = new Map<string, string[]>();

    for (const [correlationId, result] of Object.entries(results)) {
      if (!result.allowed) {
        continue;
      }

      const entry = correlationMap.get(correlationId);
      if (!entry) {
        continue;
      };

      const actions = permissionsMap.get(entry.resource) ?? [];
      actions.push(entry.action);
      permissionsMap.set(entry.resource, actions);
    }

    return Array.from(permissionsMap.entries()).map(([resource, actions]) => ({ resource, actions }));
  }

  private extractUserIdentifier(token: string): string {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      return payload.email ?? '';
    } catch {
      return '';
    }
  }

  private resolveOnParent(verb: string): boolean {
    return verb === 'create' || verb === 'list' || verb === 'watch';
  }

  private buildFgaGroup(apiGroup: string): string {
    if (!apiGroup) {
      return 'core'
    };

    return apiGroup.replace(/platform_mesh/g, 'platform-mesh');
  }
}
