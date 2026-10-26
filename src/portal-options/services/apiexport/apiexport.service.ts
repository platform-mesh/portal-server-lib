import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { KcpKubernetesService } from '../kcp-k8s.service.js';
import {
  GVR_APIEXPORT,
  GVR_POLICY,
  GVR_WORKSPACE,
  WORKSPACE_PROVIDERS,
} from './constants.js';
import {
  ApiExport,
  ApiExportPolicy,
} from './models/apiexport.model.js';
import { buildWorkspacePath } from '../../utils/build-workspace-path.util.js';

@Injectable()
export class ApiExportService {
  private readonly logger = new Logger(ApiExportService.name);

  constructor(private readonly kcpK8s: KcpKubernetesService) {}

  async listApiExports(organization: string): Promise<ApiExport[]> {
    const orgWorkspacePath = buildWorkspacePath([organization]);

    // Step 1: discover provider child workspaces (e.g. root:providers:httpbin)
    let providerWorkspacePaths: string[] = [];
    try {
      const workspacesResult = await this.kcpK8s.listClusterCustomObjects(GVR_WORKSPACE, WORKSPACE_PROVIDERS);
      providerWorkspacePaths = ((workspacesResult.items ?? []) as Array<{ metadata: { name: string } }>)
        .map((ws) => `${WORKSPACE_PROVIDERS}:${ws.metadata.name}`);
    } catch (err) {
      this.logger.warn('Failed to list provider workspaces', err);
      return [];
    }

    // Step 2: list APIExports from each provider workspace (fault-tolerant)
    const exportsResults = await Promise.allSettled(
      providerWorkspacePaths.map((path) => this.kcpK8s.listClusterCustomObjects(GVR_APIEXPORT, path)),
    );

    const exports: ApiExport[] = [];
    for (let i = 0; i < exportsResults.length; i++) {
      const result = exportsResults[i];
      if (result.status === 'fulfilled') {
        const items = (result.value.items ?? []) as ApiExport[];
        const clusterPath = providerWorkspacePaths[i];
        exports.push(...items.map((e) => ({ ...e, clusterPath })));
      } else {
        this.logger.warn(`Failed to list APIExports from ${providerWorkspacePaths[i]}`, result.reason);
      }
    }

    // Step 3: list policies to determine enabled state
    let enabledNames = new Set<string>();
    try {
      const policiesResult = await this.kcpK8s.listClusterCustomObjects(GVR_POLICY, orgWorkspacePath);
      const policies = (policiesResult.items ?? []) as ApiExportPolicy[];
      enabledNames = new Set(policies.map((p) => p.spec?.apiExportRef?.name).filter(Boolean));
    } catch (err) {
      this.logger.warn('Failed to list APIExportPolicies for org, defaulting to all disabled', err);
    }

    return exports.map((e) => ({ ...e, enabled: enabledNames.has(e.metadata.name) }));
  }

  async enableApiExport(organization: string, name: string, clusterPath: string): Promise<void> {
    const orgWorkspacePath = buildWorkspacePath([organization]);

    // Verify the APIExport exists before creating an orphaned policy
    try {
      const { items = [] } = await this.kcpK8s.listClusterCustomObjects(GVR_APIEXPORT, clusterPath);
      const exists = (items as ApiExport[]).some((e) => e.metadata.name === name);
      if (!exists) {
        throw Object.assign(new NotFoundException(`APIExport "${name}" not found in "${clusterPath}"`), { statusCode: 404 });
      }
    } catch (err) {
      this.logger.warn(`Failed to verify APIExport "${name}" in "${clusterPath}"`, err);
      throw err;
    }

    // Deterministic policy name: <exportName>--<lastProviderSegment>
    const providerSegment = clusterPath.split(':').at(-1);
    const policyName = `${name}--${providerSegment}`;

    const body: ApiExportPolicy = {
      apiVersion: `${GVR_POLICY.group}/${GVR_POLICY.version}`,
      kind: 'APIExportPolicy',
      metadata: { name: policyName },
      spec: {
        apiExportRef: { name, clusterPath },
        allowPathExpressions: [`:root:orgs:${organization}:*`],
      },
    };

    try {
      await this.kcpK8s.createClusterCustomObject(GVR_POLICY, orgWorkspacePath, body);
    } catch (err) {
      this.logger.warn(`Failed to enable APIExport "${name}" for org "${organization}"`, err);
      throw err;
    }
  }

  async disableApiExport(organization: string, name: string): Promise<void> {
    const orgWorkspacePath = buildWorkspacePath([organization]);

    // Look up policy by spec.apiExportRef.name (gkrajniak's recommendation)
    let policyName: string;
    try {
      const { items = [] } = await this.kcpK8s.listClusterCustomObjects(GVR_POLICY, orgWorkspacePath);
      const policy = (items as ApiExportPolicy[]).find((p) => p.spec?.apiExportRef?.name === name);
      if (!policy) {
        throw Object.assign(new NotFoundException(`APIExport "${name}" not found or not enabled`), { statusCode: 404 });
      }
      policyName = policy.metadata.name;
    } catch (err) {
      this.logger.warn(`Failed to find policy for APIExport "${name}" in org "${organization}"`, err);
      throw err;
    }

    try {
      await this.kcpK8s.deleteClusterCustomObject(GVR_POLICY, orgWorkspacePath, policyName);
    } catch (err) {
      this.logger.warn(`Failed to disable APIExport "${name}" for org "${organization}"`, err);
      throw err;
    }
  }
}
