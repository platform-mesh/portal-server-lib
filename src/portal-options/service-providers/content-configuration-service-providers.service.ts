import { RequestContext } from '../request-context-provider/openmfp-request-context-provider.js';
import { ContentConfigurationQueryResponse } from './models/contentconfigurations.js';
import {
  ContentConfiguration,
  ServiceProviderResponse,
  ServiceProviderService,
} from '@openmfp/portal-server-lib';
import { GraphQLClient, gql } from 'graphql-request';

export const contentConfigurationsQuery = gql`
  query {
    ui_platform_mesh_io {
      ContentConfigurations {
        metadata {
          name
          labels
        }
        spec {
          remoteConfiguration {
            url
          }
        }
        status {
          configurationResult
        }
      }
    }
  }
`;

export class ContentConfigurationServiceProvidersService
  implements ServiceProviderService
{
  async getServiceProviders(
    token: string,
    entities: string[],
    context: RequestContext,
  ): Promise<ServiceProviderResponse> {
    // Validate required parameters
    if (!token) {
      throw new Error('Token is required');
    }

    if (!context?.organization) {
      throw new Error('Context with organization is required');
    }

    let url = context.crdGatewayApiUrl.replace(
      'kubernetes-graphql-gateway/root',
      'kubernetes-graphql-gateway/virtual-workspace/contentconfigurations/root',
    );
    if (context?.account) {
      url = url.replace('/graphql', `:${context.account}/graphql`);
    }

    const client = new GraphQLClient(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    try {
      const response = await client.request<ContentConfigurationQueryResponse>(
        contentConfigurationsQuery,
        {},
      );

      // Validate response structure
      if (!response?.ui_platform_mesh_io?.ContentConfigurations) {
        throw new Error(
          'Invalid response structure: missing ContentConfigurations',
        );
      }

      const entity = !entities || !entities.length ? 'main' : entities[0];
      const contentConfigurations =
        response.ui_platform_mesh_io.ContentConfigurations.filter(
          (item) =>
            item.metadata.labels?.['ui.platform-mesh.io/entity'] === entity,
        ).map((item) => {
          try {
            // Validate required fields
            if (!item.status?.configurationResult) {
              throw new Error(
                `Missing configurationResult for item: ${item.metadata?.name || 'unknown'}`,
              );
            }

            const contentConfiguration = JSON.parse(
              item.status.configurationResult,
            ) as ContentConfiguration;

            if (!contentConfiguration.url) {
              contentConfiguration.url = item.spec.remoteConfiguration?.url;
            }
            return contentConfiguration;
          } catch (parseError) {
            // Log the error but don't fail the entire operation
            console.error(
              `Failed to parse configuration for item ${item.metadata?.name || 'unknown'}:`,
              parseError,
            );

            // Re-throw specific errors as-is, others as JSON parse errors
            if (
              parseError instanceof Error &&
              parseError.message.includes('Missing configurationResult')
            ) {
              throw parseError;
            }
            throw new Error(
              `Invalid JSON in configurationResult for item: ${item.metadata?.name || 'unknown'}`,
            );
          }
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
    } catch (error) {
      // Re-throw with more context if it's not already our custom error
      if (
        error instanceof Error &&
        error.message.includes('configurationResult')
      ) {
        throw error;
      }
      throw new Error(
        `Failed to fetch content configurations: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
