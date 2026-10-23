import { Injectable, Logger } from '@nestjs/common';
import { KcpKubernetesService } from '../kcp-k8s.service.js';
import {
  GVR_APIEXPORT,
  GVR_POLICY,
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

    const [apiExportsResult, policiesResult] = await Promise.allSettled([
      this.kcpK8s.listClusterCustomObjects(GVR_APIEXPORT, WORKSPACE_PROVIDERS),
      this.kcpK8s.listClusterCustomObjects(GVR_POLICY, orgWorkspacePath),
    ]);

    if (apiExportsResult.status === 'rejected') {
      this.logger.debug('Failed to list APIExports from providers workspace', apiExportsResult.reason);
      return [];
    }

    const exports = (apiExportsResult.value.items ?? []) as ApiExport[];

    let enabledNames = new Set<string>();
    if (policiesResult.status === 'fulfilled') {
      const policies = (policiesResult.value.items ?? []) as ApiExportPolicy[];
      enabledNames = new Set(policies.map((p) => p.spec?.apiExportRef?.name).filter(Boolean));
    } else {
      this.logger.debug('Failed to list APIExportPolicies for org, defaulting to all disabled', policiesResult.reason);
    }

    return exports.map((e) => ({ ...e, enabled: enabledNames.has(e.metadata.name) }));
  }

  async enableApiExport(organization: string, name: string): Promise<void> {
    const orgWorkspacePath = buildWorkspacePath([organization]);
    const body: ApiExportPolicy = {
      apiVersion: `${GVR_POLICY.group}/${GVR_POLICY.version}`,
      kind: 'ApiExportPolicy',
      metadata: { name },
      spec: { apiExportRef: { name } },
    };

    try {
      await this.kcpK8s.createClusterCustomObject(GVR_POLICY, orgWorkspacePath, body);
    } catch (err) {
      this.logger.debug(`Failed to enable APIExport "${name}" for org "${organization}"`, err);
      throw err;
    }
  }

  async disableApiExport(organization: string, name: string): Promise<void> {
    const orgWorkspacePath = buildWorkspacePath([organization]);

    try {
      await this.kcpK8s.deleteClusterCustomObject(GVR_POLICY, orgWorkspacePath, name);
    } catch (err) {
      this.logger.debug(`Failed to disable APIExport "${name}" for org "${organization}"`, err);
      throw err;
    }
  }
}
