import { RequestContextProviderImpl } from '../openmfp-request-context-provider.js';
import { IAMGraphQlService } from './iam-graphql.service.js';
import { MUTATION_LOGIN } from './queries.js';
import { GraphQLClient } from 'graphql-request';
import { mock } from 'jest-mock-extended';

describe('IAMGraphQlService', () => {
  const mockIamServiceApiUrl = 'http://localhost:8080/query';
  let service: IAMGraphQlService;
  const gqlClient = {
    request: jest.fn(),
  } as unknown as GraphQLClient;

  const requestContextProvider = mock<RequestContextProviderImpl>({
    getContextValues: jest
      .fn()
      .mockResolvedValue({ iamServiceApiUrl: mockIamServiceApiUrl }),
  });

  let GraphQLClientMock: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();

    // Re-apply RequestContextProvider mock after resetAllMocks
    (
      requestContextProvider.getContextValues as unknown as jest.Mock
    ).mockResolvedValue({
      iamServiceApiUrl: mockIamServiceApiUrl,
    });

    // Mock GraphQLClient constructor to return our mocked client
    GraphQLClientMock = jest
      .spyOn<any, any>(require('graphql-request'), 'GraphQLClient')
      .mockImplementation(() => gqlClient);

    service = new IAMGraphQlService(requestContextProvider as any);
  });

  it('should call mutation addUser', async () => {
    (gqlClient.request as jest.Mock).mockResolvedValue('');

    const response = await service.addUser('token', {} as any);

    expect(GraphQLClientMock).toHaveBeenCalledWith(mockIamServiceApiUrl, {
      headers: { Authorization: 'Bearer token' },
    });
    expect(gqlClient.request).toHaveBeenCalledWith(MUTATION_LOGIN);
    expect(response).toBe(undefined);
  });

  it('should call mutation addUser and log error', async () => {
    console.error = jest.fn();
    (gqlClient.request as jest.Mock).mockRejectedValue('error');

    const response = await service.addUser('token', {} as any);
    expect(response).toBe(undefined);
    expect(console.error).toHaveBeenCalledWith('error');
  });
});
