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
  AuthModelList,
  BatchCheckResponse,
  BatchCheckResult,
  BatchCheckTuple,
} from './models/open-fga.model.js';
import { StoreIdResolver } from './store-id.resolver.js';

@Injectable()
export class OpenFgaAdapter implements IPermissionsAdapter {
  private readonly logger = new Logger(OpenFgaAdapter.name);
  private readonly storeIdResolver =  new StoreIdResolver();

  constructor(
    private readonly httpService: HttpService,
    private readonly apiUrl: string,
  ) {}

  private resolveFgaType(apiGroup: string, entity: string): string {
    return apiGroup
      ? `${apiGroup}_${entity}`.toLowerCase()
      : entity.toLowerCase();
  }

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
    const tuples: BatchCheckTuple[] = [];
    const correlationMap = new Map<string, { resource: string; action: string }>();

    for (const check of req.checks) {
      const fgaType = this.resolveFgaType(check.apiGroup, check.resource);
      const actions = check.actions === 'All'
        ? await this.discoverRelations(fgaType, store.storeId)
        : check.actions;

      for (const action of actions) {
        const correlationId = `${check.resource}-${action}`;
        correlationMap.set(correlationId, { resource: check.resource, action });
        tuples.push({
          tuple_key: {
            user: `user:${userIdentifier}`,
            relation: action,
            object: `${fgaType}:${req.accountPath}`,
          },
          correlation_id: correlationId,
        });
      }
    }

    if (!tuples.length) {
      return { accountPath: req.accountPath, permissions: [] };
    }

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
    } catch (err) {
      this.logger.error('OpenFGA batch-check failed', err);
      return { accountPath: req.accountPath, permissions: [] };
    }

    const permissionsMap = new Map<string, string[]>();
    for (const [correlationId, result] of Object.entries(results)) {
      if (!result.allowed) continue;
      const entry = correlationMap.get(correlationId);
      if (!entry) continue;
      const actions = permissionsMap.get(entry.resource) ?? [];
      actions.push(entry.action);
      permissionsMap.set(entry.resource, actions);
    }

    const permissions: Permission[] = Array.from(permissionsMap.entries()).map(
      ([resource, actions]) => ({ resource, actions }),
    );

    return { accountPath: req.accountPath, permissions };
  }

  private async discoverRelations(resourceType: string, storeId: string): Promise<string[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<AuthModelList>(
          `${this.apiUrl}/stores/${storeId}/authorization-models`,
        ),
      );
      const latestModel = response.data.authorization_models?.[0];
      const typeDef = latestModel?.type_definitions?.find(
        (t) => t.type === resourceType,
      );
      return typeDef ? Object.keys(typeDef.relations) : [];
    } catch (err) {
      this.logger.warn(`Could not discover relations for ${resourceType}`, err);
      return [];
    }
  }
}
