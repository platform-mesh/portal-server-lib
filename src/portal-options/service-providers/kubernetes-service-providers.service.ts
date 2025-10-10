import { KcpKubernetesService } from '../services/kcp-k8s.service.js';
import { welcomeNodeConfig } from './models/welcome-node-config.js';
import { PromiseMiddlewareWrapper } from '@kubernetes/client-node/dist/gen/middleware.js';
import { Injectable } from '@nestjs/common';
import {
  ContentConfiguration,
  ServiceProviderResponse,
  ServiceProviderService,
} from '@openmfp/portal-server-lib';

@Injectable()
export class KubernetesServiceProvidersService
  implements ServiceProviderService
{
  constructor(private kcpKubernetesService: KcpKubernetesService) {}

  async getServiceProviders(
    token: string,
    entities: string[],
    context: Record<string, any>,
  ): Promise<ServiceProviderResponse> {
    // Validate required parameters
    if (!token) {
      throw new Error('Token is required');
    }

    if (!context.isSubDomain && !context.isLocalhost) {
      return welcomeNodeConfig;
    }

    if (!context?.organization) {
      throw new Error('Context with organization is required');
    }

    const entity = !entities || !entities.length ? 'main' : entities[0];

    let response;
    try {
      response = await this.getKubernetesResources(entity, context, token);
    } catch (error) {
      console.error(error);

      if (error.code == 429 || error.statusCode == 429) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log('Retry after 1 second reading kubernetes resources.');
        response = await this.getKubernetesResources(entity, context, token);
      }
    }

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
        return contentConfiguration;
      });

    return {
      rawServiceProviders: [
        {
          name: 'platform-mesh-system',
          displayName: '',
          creationTimestamp: '',
          contentConfiguration: contentConfigurations,
        },
      ],
    };
  }

  private async getKubernetesResources(
    entity: string,
    requestContext: Record<string, any>,
    token: string,
  ) {
    const gvr = {
      group: 'ui.platform-mesh.io',
      version: 'v1alpha1',
      plural: 'contentconfigurations',
      labelSelector: `ui.platform-mesh.io/entity=${entity}`,
    };

    const k8sApi = this.kcpKubernetesService.getKcpK8sApiClient();
    return await k8sApi.listClusterCustomObject(gvr, {
      middleware: [
        new PromiseMiddlewareWrapper({
          pre: async (context) => {
            const kcpUrl = this.kcpKubernetesService.getKcpVirtualWorkspaceUrl(
              requestContext.organization,
              requestContext?.['core_platform-mesh_io_account'],
            );
            const path = `${kcpUrl}/apis/${gvr.group}/${gvr.version}/${gvr.plural}`;
            console.log('kcp url: ', path);

            context.setUrl(path);
            context.setHeaderParam('Authorization', `Bearer ${token}`);
            return context;
          },
          post: async (context) => context,
        }),
      ],
    });
  }
}
