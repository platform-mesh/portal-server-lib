import { createHash } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiException } from '@kubernetes/client-node/dist/gen/apis/exception.js';
import { KcpKubernetesService } from '../kcp-k8s.service.js';
import {
  GVR_APIEXPORT,
  GVR_POLICY,
  GVR_WORKSPACE,
  WORKSPACE_POLICY_HOME,
  WORKSPACE_PROVIDERS,
} from './constants.js';
import {
  AllowRule,
  ApiExportAdminItem,
  ApiExportCRD,
  ApiExportPolicyCRD,
  KcpWorkspace,
  SetApiExportPolicyRequest,
} from './models/apiexport.model.js';

// Kubernetes DNS subdomain: lowercase alphanumeric, hyphens, dots; max 253 chars
const K8S_NAME_RE = /^[a-z0-9]([a-z0-9\-.]{0,251}[a-z0-9])?$/;
// Provider path segment (after root:providers:)
const PATH_SEGMENT_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

@Injectable()
export class ApiExportService {
  private readonly logger = new Logger(ApiExportService.name);

  constructor(private readonly kcpK8s: KcpKubernetesService) {}

  private validateApiExportName(name: string): void {
    if (!name || !K8S_NAME_RE.test(name)) {
      throw new BadRequestException(
        `Invalid APIExport name: must be a DNS subdomain (lowercase alphanumeric, hyphens, dots; max 253 chars)`,
      );
    }
  }

  private validateClusterPath(clusterPath: string): void {
    if (!clusterPath) {
      throw new BadRequestException('clusterPath is required');
    }
    if (!clusterPath.startsWith('root:providers:')) {
      throw new BadRequestException(
        `clusterPath must start with "root:providers:" — got "${clusterPath}"`,
      );
    }
    const suffix = clusterPath.slice('root:providers:'.length);
    if (!suffix) {
      throw new BadRequestException(
        `clusterPath must name a provider workspace, e.g. "root:providers:httpbin"`,
      );
    }
    const segments = suffix.split(':');
    for (const seg of segments) {
      if (!PATH_SEGMENT_RE.test(seg)) {
        throw new BadRequestException(
          `Invalid clusterPath segment "${seg}": segments must be lowercase alphanumeric with hyphens, max 63 chars`,
        );
      }
    }
  }

  private validateAllowRules(rules: AllowRule[]): void {
    if (!Array.isArray(rules)) {
      throw new BadRequestException('allowRules must be an array');
    }
    const seen = new Set<string>();
    for (const rule of rules) {
      if (typeof rule.path !== 'string' || !rule.path) {
        throw new BadRequestException('Each allowRule must have a non-empty path string');
      }
      if (typeof rule.includeDescendants !== 'boolean') {
        throw new BadRequestException('Each allowRule must have an includeDescendants boolean');
      }

      if (rule.path !== 'root:orgs' && !rule.path.startsWith('root:orgs:')) {
        throw new BadRequestException(
          `allowRule path must start with "root:orgs" — got "${rule.path}"`,
        );
      }

      // "root:orgs" exact without descendants is invalid (all-orgs exact not supported)
      if (rule.path === 'root:orgs' && !rule.includeDescendants) {
        throw new BadRequestException(
          `{ path: "root:orgs", includeDescendants: false } is invalid — use includeDescendants: true for all-orgs`,
        );
      }

      // Validate path segments after "root:orgs"
      if (rule.path !== 'root:orgs') {
        const tail = rule.path.slice('root:orgs:'.length);
        if (!tail) {
          throw new BadRequestException(`Invalid allowRule path "${rule.path}"`);
        }
        for (const seg of tail.split(':')) {
          if (!seg || /[^a-z0-9\-.]/.test(seg)) {
            throw new BadRequestException(
              `Invalid path segment "${seg}" in allowRule path "${rule.path}"`,
            );
          }
        }
      }

      const key = `${rule.path}|${rule.includeDescendants}`;
      if (seen.has(key)) {
        throw new BadRequestException(
          `Duplicate allowRule: path "${rule.path}" includeDescendants ${rule.includeDescendants}`,
        );
      }
      seen.add(key);
    }
  }

  /** Convert { path, includeDescendants } → `:root:orgs:<path>` or `:root:orgs:<path>:*` */
  private allowRuleToExpression(rule: AllowRule): string {
    if (rule.path === 'root:orgs') {
      // all-orgs wildcard
      return `:root:orgs:*`;
    }
    return rule.includeDescendants ? `:${rule.path}:*` : `:${rule.path}`;
  }

  /** Convert `:root:orgs:<path>` or `:root:orgs:<path>:*` → { path, includeDescendants } */
  private expressionToAllowRule(expr: string): AllowRule | null {
    const s = expr.startsWith(':') ? expr.slice(1) : expr;
    if (s !== 'root:orgs' && !s.startsWith('root:orgs:')) {
      return null;
    }
    if (s.endsWith(':*')) {
      const base = s.slice(0, -2); // remove trailing :*
      const path = base === 'root:orgs' ? 'root:orgs' : base;
      return { path, includeDescendants: true };
    }
    return { path: s, includeDescendants: false };
  }

  /**
   * Derive a deterministic, collision-resistant Kubernetes resource name from
   * export identity (name + clusterPath). Uses a readable prefix plus a 10-char
   * hex hash so the total stays well under 253 chars.
   */
  private policyName(exportName: string, clusterPath: string): string {
    const hash = createHash('sha256')
      .update(`${exportName}|${clusterPath}`)
      .digest('hex')
      .slice(0, 10);

    // Sanitize exportName for use as prefix: lowercase, replace invalid chars with '-', max 24 chars
    const prefix = exportName
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, '-')
      .replace(/^[^a-z0-9]+/, '') // strip leading non-alnum
      .replace(/[^a-z0-9]+$/, '') // strip trailing non-alnum
      .slice(0, 24);

    if (!prefix) {
      return `policy-${hash}`;
    }
    return `${prefix}-${hash}`;
  }

  /**
   * Map a raw kubernetes client error to an appropriate NestJS HttpException.
   * `@kubernetes/client-node` 2.x carries the HTTP status in `ApiException.code`.
   * We also check `statusCode` as a fallback for compatibility with existing mocks.
   */
  private mapK8sError(err: unknown, contextMessage: string): never {
    if (err instanceof HttpException) {
      throw err;
    }

    const code =
      err instanceof ApiException
        ? err.code
        : ((err as { code?: number; statusCode?: number })?.code ??
          (err as { statusCode?: number })?.statusCode);

    switch (code) {
      case 404:
        throw new NotFoundException(contextMessage);
      case 409:
        throw new ConflictException(contextMessage);
      case 403:
        throw new ForbiddenException(contextMessage);
      case 422:
        throw new UnprocessableEntityException(contextMessage);
      default: {
        this.logger.error(`Unexpected KCP error (${contextMessage})`, err);
        throw new InternalServerErrorException(contextMessage);
      }
    }
  }

  async listApiExports(): Promise<ApiExportAdminItem[]> {
    // List child workspaces under root:providers
    let providerWorkspaces: string[];
    try {
      const result = (await this.kcpK8s.listClusterCustomObjects(
        GVR_WORKSPACE,
        WORKSPACE_PROVIDERS,
      )) as { items: KcpWorkspace[] };
      providerWorkspaces = (result.items ?? []).map(
        (ws) => `${WORKSPACE_PROVIDERS}:${ws.metadata.name}`,
      );
    } catch (err) {
      this.logger.error('Failed to list provider workspaces', err);
      throw new InternalServerErrorException('Failed to list provider workspaces from KCP');
    }

    if (providerWorkspaces.length === 0) {
      this.logger.warn('No provider workspaces found under root:providers');
    }

    // Load all exports per provider workspace in parallel
    const exportResults = await Promise.allSettled(
      providerWorkspaces.map(async (wsPath) => {
        const result = (await this.kcpK8s.listClusterCustomObjects(GVR_APIEXPORT, wsPath)) as {
          items: ApiExportCRD[];
        };
        return { wsPath, exports: result.items ?? [] };
      }),
    );

    const allExports: { wsPath: string; export: ApiExportCRD }[] = [];
    for (const r of exportResults) {
      if (r.status === 'rejected') {
        this.logger.error('Failed to list APIExports from a provider workspace', r.reason);
        throw new InternalServerErrorException(
          'Failed to list APIExports from one or more provider workspaces',
        );
      }
      for (const exp of r.value.exports) {
        allExports.push({ wsPath: r.value.wsPath, export: exp });
      }
    }

    // Load policies from root:orgs
    let policies: ApiExportPolicyCRD[];
    try {
      const result = (await this.kcpK8s.listClusterCustomObjects(
        GVR_POLICY,
        WORKSPACE_POLICY_HOME,
      )) as { items: ApiExportPolicyCRD[] };
      policies = result.items ?? [];
    } catch (err) {
      this.logger.error('Failed to list APIExportPolicies from root:orgs', err);
      throw new InternalServerErrorException('Failed to load APIExportPolicies from KCP');
    }

    // Index policies by export name + clusterPath
    const policyIndex = new Map<string, ApiExportPolicyCRD>();
    for (const p of policies) {
      const key = `${p.spec.apiExportRef.name}|${p.spec.apiExportRef.clusterPath}`;
      policyIndex.set(key, p);
    }

    return allExports.map(({ wsPath, export: exp }) => {
      const key = `${exp.metadata.name}|${wsPath}`;
      const policy = policyIndex.get(key);
      const allowRules: AllowRule[] = [];
      if (policy) {
        for (const expr of policy.spec.allowPathExpressions) {
          const rule = this.expressionToAllowRule(expr);
          if (rule) {
            allowRules.push(rule);
          }
        }
      }
      return {
        metadata: {
          name: exp.metadata.name,
          ...(exp.metadata.annotations ? { annotations: exp.metadata.annotations } : {}),
          ...(exp.metadata.labels ? { labels: exp.metadata.labels } : {}),
        },
        clusterPath: wsPath,
        allowRules,
      };
    });
  }

  async setApiExportPolicy(name: string, request: SetApiExportPolicyRequest): Promise<void> {
    const { clusterPath, allowRules } = request;

    this.validateApiExportName(name);
    this.validateClusterPath(clusterPath);
    this.validateAllowRules(allowRules);

    // Verify APIExport exists in the given provider workspace
    try {
      await this.kcpK8s.getClusterCustomObject(GVR_APIEXPORT, clusterPath, name);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      const code =
        err instanceof ApiException
          ? err.code
          : ((err as { code?: number; statusCode?: number })?.code ??
            (err as { statusCode?: number })?.statusCode);
      if (code === 404) {
        throw new NotFoundException(
          `APIExport "${name}" not found in provider workspace "${clusterPath}"`,
        );
      }
      if (code === 403) {
        throw new ForbiddenException(
          `Access denied when checking APIExport "${name}" in "${clusterPath}"`,
        );
      }
      this.logger.error(`Error verifying APIExport "${name}" in "${clusterPath}"`, err);
      throw new InternalServerErrorException(
        `Failed to verify APIExport "${name}" in "${clusterPath}"`,
      );
    }

    const polName = this.policyName(name, clusterPath);

    if (allowRules.length === 0) {
      // Delete policy if it exists, otherwise no-op (idempotent)
      try {
        await this.kcpK8s.deleteClusterCustomObject(GVR_POLICY, WORKSPACE_POLICY_HOME, polName);
      } catch (err) {
        if (err instanceof HttpException) throw err;
        const code =
          err instanceof ApiException
            ? err.code
            : ((err as { code?: number; statusCode?: number })?.code ??
              (err as { statusCode?: number })?.statusCode);
        if (code === 404) {
          return; // already absent — idempotent
        }
        this.mapK8sError(err, `Failed to delete policy for "${name}"`);
      }
      return;
    }

    const expressions = allowRules.map((rule) => this.allowRuleToExpression(rule));

    // Try to get existing policy, then create or replace
    let existing: ApiExportPolicyCRD | null = null;
    try {
      existing = (await this.kcpK8s.getClusterCustomObject(
        GVR_POLICY,
        WORKSPACE_POLICY_HOME,
        polName,
      )) as ApiExportPolicyCRD;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      const code =
        err instanceof ApiException
          ? err.code
          : ((err as { code?: number; statusCode?: number })?.code ??
            (err as { statusCode?: number })?.statusCode);
      if (code !== 404) {
        this.mapK8sError(err, `Failed to read existing policy for "${name}"`);
      }
      // 404 → policy does not exist yet
    }

    if (existing) {
      const updated: ApiExportPolicyCRD = {
        apiVersion: `${GVR_POLICY.group}/${GVR_POLICY.version}`,
        kind: 'APIExportPolicy',
        metadata: {
          name: polName,
          resourceVersion: existing.metadata.resourceVersion,
        },
        spec: {
          apiExportRef: { name, clusterPath },
          allowPathExpressions: expressions,
        },
      };
      try {
        await this.kcpK8s.replaceClusterCustomObject(
          GVR_POLICY,
          WORKSPACE_POLICY_HOME,
          polName,
          updated,
        );
      } catch (err) {
        this.mapK8sError(err, `Failed to update policy for "${name}"`);
      }
    } else {
      const body: ApiExportPolicyCRD = {
        apiVersion: `${GVR_POLICY.group}/${GVR_POLICY.version}`,
        kind: 'APIExportPolicy',
        metadata: { name: polName },
        spec: {
          apiExportRef: { name, clusterPath },
          allowPathExpressions: expressions,
        },
      };
      try {
        await this.kcpK8s.createClusterCustomObject(GVR_POLICY, WORKSPACE_POLICY_HOME, body);
      } catch (err) {
        if (err instanceof HttpException) throw err;
        const code =
          err instanceof ApiException
            ? err.code
            : ((err as { code?: number; statusCode?: number })?.code ??
              (err as { statusCode?: number })?.statusCode);
        if (code === 409) {
          // Race: another request created it between our get and create → replace
          try {
            const current = (await this.kcpK8s.getClusterCustomObject(
              GVR_POLICY,
              WORKSPACE_POLICY_HOME,
              polName,
            )) as ApiExportPolicyCRD;
            const updated: ApiExportPolicyCRD = {
              apiVersion: `${GVR_POLICY.group}/${GVR_POLICY.version}`,
              kind: 'APIExportPolicy',
              metadata: {
                name: polName,
                resourceVersion: current.metadata.resourceVersion,
              },
              spec: {
                apiExportRef: { name, clusterPath },
                allowPathExpressions: expressions,
              },
            };
            await this.kcpK8s.replaceClusterCustomObject(
              GVR_POLICY,
              WORKSPACE_POLICY_HOME,
              polName,
              updated,
            );
          } catch (innerErr) {
            this.mapK8sError(innerErr, `Failed to resolve create/update race for policy "${name}"`);
          }
          return;
        }
        this.mapK8sError(err, `Failed to create policy for "${name}"`);
      }
    }
  }
}
