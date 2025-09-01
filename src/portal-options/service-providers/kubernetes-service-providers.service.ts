import { CustomObjectsApi, KubeConfig } from '@kubernetes/client-node';
import { PromiseMiddlewareWrapper } from '@kubernetes/client-node/dist/gen/middleware.js';
import {
  ContentConfiguration,
  ServiceProviderResponse,
  ServiceProviderService,
} from '@openmfp/portal-server-lib';

export class KubernetesServiceProvidersService
  implements ServiceProviderService
{
  private k8sApi: CustomObjectsApi;
  private baseUrl: URL;

  constructor() {
    const kc = new KubeConfig();
    kc.loadFromDefault();
    this.baseUrl = new URL(kc.getCurrentCluster()?.server || '');
    this.k8sApi = kc.makeApiClient(CustomObjectsApi);
  }

  async getServiceProviders(
    token: string,
    entities: string[],
    context: Record<string, any>,
  ): Promise<ServiceProviderResponse> {
    const entity = !entities || !entities.length ? 'main' : entities[0];

    let response;
    try {
      response = await this.getKubernetesResources(entity, context);
    } catch (error) {
      console.error(error);

      if (error.code == 429 || error.statusCode == 429) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log('Retry after 1 second reading kubernetes resources.');
        response = await this.getKubernetesResources(entity, context);
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
          name: 'openmfp-system',
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
  ) {
    const gvr = {
      group: 'core.openmfp.io',
      version: 'v1alpha1',
      plural: 'contentconfigurations',
      labelSelector: `ui.platform-mesh.io/entity=${entity}`,
    };
    return await this.k8sApi.listClusterCustomObject(gvr, {
      middleware: [
        new PromiseMiddlewareWrapper({
          pre: async (context) => {
            const url = new URL(context.getUrl());

            let path = `${this.baseUrl.pathname}/clusters/root:orgs:${requestContext.organization}`;
            if (requestContext?.account) {
              path += `:${requestContext.account}`; // FIXME: how are nested accounts and paths handled in the portal?
            }
            path += `/apis/${gvr.group}/${gvr.version}/${gvr.plural}`;

            url.pathname = path;
            context.setUrl(url.toString());
            return context;
          },
          post: async (context) => context,
        }),
      ],
    });
  }
}
