import { RequestContext } from '../openmfp-request-context-provider.js';
import { ContentConfigurationServiceProvidersService } from './content-configuration-service-providers.service.js';
import { welcomeNodeConfig } from './models/welcome-node-config.js';
import { EnvService } from '@openmfp/portal-server-lib';
import { GraphQLClient } from 'graphql-request';
import { mock } from 'jest-mock-extended';

jest.mock('graphql-request', () => {
  return {
    GraphQLClient: jest.fn().mockImplementation(() => ({
      request: jest.fn(),
    })),
    gql(query: TemplateStringsArray) {
      return query[0];
    },
  };
});

describe('ContentConfigurationServiceProvidersService', () => {
  let service: ContentConfigurationServiceProvidersService;
  let mockClient: jest.Mocked<GraphQLClient>;
  let mockEnvService: jest.Mocked<EnvService>;
  let context: RequestContext;

  beforeEach(() => {
    mockEnvService = mock();
    mockEnvService.getEnv.mockReturnValue({ isLocal: false });
    service = new ContentConfigurationServiceProvidersService(mockEnvService);
    mockClient = new GraphQLClient('') as any;
    (GraphQLClient as jest.Mock).mockReturnValue(mockClient);
    context = {
      isSubDomain: true,
      organization: 'org1',
      crdGatewayApiUrl:
        'http://example.com/kubernetes-graphql-gateway/root/graphql',
      account: 'acc1',
    } as RequestContext;
  });

  it('throws if token is missing', async () => {
    await expect(
      service.getServiceProviders('', ['entity'], context),
    ).rejects.toThrow('Token is required');
  });

  it('throws if context organization is missing', async () => {
    const badContext = { ...context, organization: undefined } as any;
    await expect(
      service.getServiceProviders('token', ['entity'], badContext),
    ).rejects.toThrow('Context with organization is required');
  });

  it('throws if context organization is missing', async () => {
    context.isSubDomain = false;
    const result = await service.getServiceProviders(
      'token',
      ['entity'],
      context,
    );

    expect(result).toEqual(welcomeNodeConfig);
  });

  it('returns parsed content configurations', async () => {
    mockClient.request.mockResolvedValue({
      ui_platform_mesh_io: {
        ContentConfigurations: [
          {
            metadata: {
              name: 'conf1',
              labels: { 'ui.platform-mesh.io/entity': 'entity' },
            },
            spec: { remoteConfiguration: { url: 'http://remote' } },
            status: {
              configurationResult: JSON.stringify({ url: 'http://parsed' }),
            },
          },
        ],
      },
    });
    const result = await service.getServiceProviders(
      'token',
      ['entity'],
      context,
    );
    expect(result.rawServiceProviders[0].contentConfiguration[0].url).toBe(
      'http://parsed',
    );
  });

  it('falls back to spec.remoteConfiguration.url if missing in parsed config', async () => {
    mockClient.request.mockResolvedValue({
      ui_platform_mesh_io: {
        ContentConfigurations: [
          {
            metadata: {
              name: 'conf1',
              labels: { 'ui.platform-mesh.io/entity': 'entity' },
            },
            spec: { remoteConfiguration: { url: 'http://remote' } },
            status: { configurationResult: JSON.stringify({}) },
          },
        ],
      },
    });
    const result = await service.getServiceProviders(
      'token',
      ['entity'],
      context,
    );
    expect(result.rawServiceProviders[0].contentConfiguration[0].url).toBe(
      'http://remote',
    );
  });

  it('throws on missing configurationResult', async () => {
    mockClient.request.mockResolvedValue({
      ui_platform_mesh_io: {
        ContentConfigurations: [
          {
            metadata: {
              name: 'conf1',
              labels: { 'ui.platform-mesh.io/entity': 'entity' },
            },
            spec: { remoteConfiguration: { url: 'http://remote' } },
            status: {},
          },
        ],
      },
    });
    await expect(
      service.getServiceProviders('token', ['entity'], context),
    ).rejects.toThrow('Missing configurationResult');
  });

  it('throws if response structure is invalid', async () => {
    mockClient.request.mockResolvedValue({});
    await expect(
      service.getServiceProviders('token', ['entity'], context),
    ).rejects.toThrow(
      'Invalid response structure: missing ContentConfigurations',
    );
  });

  it('wraps unexpected errors', async () => {
    mockClient.request.mockRejectedValue(new Error('network error'));
    await expect(
      service.getServiceProviders('token', ['entity'], context),
    ).rejects.toThrow('Failed to fetch content configurations: network error');
  });
});
