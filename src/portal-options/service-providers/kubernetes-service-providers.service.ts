import { Injectable } from '@nestjs/common';
import {
  ContentConfiguration,
  ServiceProviderResponse,
  ServiceProviderService,
} from '@openmfp/portal-server-lib';
import { K8sRequestContext, K8sResourceDescriptor } from '../models/k8s.js';
import { KcpKubernetesService } from '../services/kcp-k8s.service.js';
import { PermissionsProxyService } from '../services/permissions/permissions-proxy.service.js';
import { processContentConfigurationForAccountHierarchy } from '../utils/account-hierarchy-resolver.js';
import { welcomeNodeConfig } from './models/welcome-node-config.js';

@Injectable()
export class KubernetesServiceProvidersService implements ServiceProviderService {
  constructor(
    private kcpKubernetesService: KcpKubernetesService,
    private permissionsProxyService: PermissionsProxyService,
  ) {}

  async getServiceProviders(
    token: string,
    entities: string[],
    context: Record<string, any>,
  ): Promise<ServiceProviderResponse> {
    // Validate required parameters
    if (!token) {
      throw new Error('Token is required');
    }

    if (!context.isSubDomain) {
      return welcomeNodeConfig;
    }

    if (!context?.organization) {
      throw new Error('Context with organization is required');
    }
    
    const response = await this.listContentConfigurationsForEntity(
      token,
      context as K8sRequestContext,
    );

    if (!response.items) {
      return {
        rawServiceProviders: [],
      };
    }

    const responseItems = response.items as any[];

    const contentConfigurations = responseItems
      .filter((item) => !!item.status.configurationResult)
      .map((item) => {
        const contentConfiguration = JSON.parse(
          item.status.configurationResult,
        ) as ContentConfiguration;
        if (!contentConfiguration.url) {
          contentConfiguration.url = item.spec.remoteConfiguration?.url;
        }

        processContentConfigurationForAccountHierarchy(
          contentConfiguration,
          context,
        );

        return contentConfiguration;
      });

    const accountPath =
      context?.accountPath ?? context?.['core_platform-mesh_io_account'] ?? '';
    const nodesPermissions = await this.permissionsProxyService.resolvePermissions(
      token,
      context.organization,
      accountPath,
      contentConfigurations,
    );

    return {
      rawServiceProviders: [
        {
          name: 'platform-mesh-system',
          displayName: '',
          creationTimestamp: '',
          contentConfiguration: contentConfigurations,
          nodeContext: { nodesPermissions },
        },
      ],
    };
  }

  private async listContentConfigurationsForEntity(
    token: string,
    context: K8sRequestContext,
  ) {
    const gvr: K8sResourceDescriptor = {
      group: 'ui.platform-mesh.io',
      version: 'v1alpha1',
      plural: 'contentconfigurations',
    };

    try {
      return await this.kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace(
        gvr,
        context,
        token,
      );
    } catch (error: any) {
      console.error(error);

      if (error.code == 429 || error.statusCode == 429) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log('Retry after 1 second reading kubernetes resources.');
        return await this.kcpKubernetesService.listClusterCustomObjectInKcpVirtualWorkspace(
          gvr,
          context,
          token,
        );
      }
    }

    return {};
  }
}
