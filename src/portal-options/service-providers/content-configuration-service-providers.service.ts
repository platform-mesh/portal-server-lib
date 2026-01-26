import { RequestContext } from '../pm-request-context-provider.js';
import { processContentConfigurationForAccountHierarchy } from '../utils/account-hierarchy-resolver.js';
import { contentConfigurationsQuery } from './contentconfigurations-query.js';
import { ContentConfigurationQueryResponse } from './models/contentconfigurations.js';
import { welcomeNodeConfig } from './models/welcome-node-config.js';
import { Injectable, Logger } from '@nestjs/common';
import {
  ContentConfiguration,
  ServiceProviderResponse,
  ServiceProviderService,
} from '@openmfp/portal-server-lib';
import { GraphQLClient } from 'graphql-request';

@Injectable()
export class ContentConfigurationServiceProvidersService implements ServiceProviderService {
  private readonly logger = new Logger(
    ContentConfigurationServiceProvidersService.name,
  );
  async getServiceProviders(
    token: string,
    entities: string[],
    context: RequestContext,
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

    let url = context.crdGatewayApiUrl.replace(
      'kubernetes-graphql-gateway/root',
      'kubernetes-graphql-gateway/virtual-workspace/contentconfigurations/root',
    );

    const accountPath =
      context?.accountPath ?? context?.['core_platform-mesh_io_account'];
    if (accountPath) {
      url = url.replace('/graphql', `:${accountPath}/graphql`);
    }

    console.log(`Calculated crd gateway api url: ${url}`);
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
      if (!response?.ui_platform_mesh_io?.v1alpha1?.ContentConfigurations) {
        throw new Error(
          'Invalid response structure: missing ContentConfigurations',
        );
      }

      const entity = !entities || !entities.length ? 'main' : entities[0];
      const contentConfigurations =
        response.ui_platform_mesh_io.v1alpha1.ContentConfigurations.items
          .filter(
            (item) =>
              item.metadata.labels?.['ui.platform-mesh.io/entity'] === entity,
          )
          .map((item) => {
            try {
              // Skip items without configurationResult (not ready yet)
              // This can happen when the ContentConfiguration resource exists but
              // the remote configuration hasn't been fetched yet (e.g., DNS failure,
              // network issues, or the remote server is unavailable)
              if (!item.status?.configurationResult) {
                this.logger.warn(
                  `Skipping ContentConfiguration '${item.metadata?.name || 'unknown'}': ` +
                    `missing configurationResult (resource may not be ready)`,
                );
                return null;
              }

              const contentConfiguration = JSON.parse(
                item.status.configurationResult,
              ) as ContentConfiguration;

              if (!contentConfiguration.url) {
                contentConfiguration.url = item.spec.remoteConfiguration?.url;
              }

              const accountPath =
                context.accountPath || context['core_platform-mesh_io_account'];
              if (accountPath) {
                processContentConfigurationForAccountHierarchy(
                  contentConfiguration,
                  accountPath,
                );
              }

              return contentConfiguration;
            } catch (parseError) {
              // Log the error but don't fail the entire operation
              // Skip items with invalid JSON in configurationResult
              this.logger.warn(
                `Skipping ContentConfiguration '${item.metadata?.name || 'unknown'}': ` +
                  `failed to parse configurationResult - ${parseError instanceof Error ? parseError.message : 'unknown error'}`,
              );
              return null;
            }
          })
          .filter(
            (config): config is ContentConfiguration => config !== null,
          );

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
    } catch (error) {
      throw new Error(
        `Failed to fetch content configurations: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
