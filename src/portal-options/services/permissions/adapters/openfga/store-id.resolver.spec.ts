import { StoreIdResolver } from './store-id.resolver.js';

const mockGetClusterCustomObject = jest.fn();

jest.mock('@kubernetes/client-node', () => {
  const makeApiInstance = () => ({ getClusterCustomObject: mockGetClusterCustomObject });
  const KubeConfig = jest.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.loadFromFile = jest.fn();
    this.loadFromOptions = jest.fn();
    this.getCurrentCluster = jest.fn().mockReturnValue({ server: 'https://kcp.local', caData: undefined, skipTLSVerify: true });
    this.getCurrentUser = jest.fn().mockReturnValue({ certData: undefined, keyData: undefined });
    this.makeApiClient = jest.fn().mockReturnValue(makeApiInstance());
  });
  return { KubeConfig, CustomObjectsApi: jest.fn() };
});

const STORE_RESPONSE = {
  status: { storeId: 'store-123', authorizationModelId: 'model-456' },
};

const ACCOUNT_INFO_RESPONSE = {
  spec: { account: { originClusterId: 'origin-abc', generatedClusterId: 'gen-xyz' } },
};

describe('StoreIdResolver', () => {
  let resolver: StoreIdResolver;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env['KUBECONFIG_KCP'] = '/fake/kubeconfig';
    mockGetClusterCustomObject
      .mockResolvedValueOnce(STORE_RESPONSE)
      .mockResolvedValueOnce(ACCOUNT_INFO_RESPONSE);
    resolver = new StoreIdResolver();
  });

  it('returns undefined when KUBECONFIG_KCP is not set', async () => {
    delete process.env['KUBECONFIG_KCP'];
    const r = new StoreIdResolver();
    expect(await r.resolve('myorg')).toBeUndefined();
  });

  it('resolves storeId, authorizationModelId, originClusterId, generatedClusterId', async () => {
    const result = await resolver.resolve('myorg');
    expect(result).toEqual({
      storeId: 'store-123',
      authorizationModelId: 'model-456',
      originClusterId: 'origin-abc',
      generatedClusterId: 'gen-xyz',
    });
  });

  it('returns undefined when Store CR has no storeId', async () => {
    mockGetClusterCustomObject.mockReset();
    mockGetClusterCustomObject.mockResolvedValueOnce({ status: {} });
    expect(await resolver.resolve('myorg')).toBeUndefined();
  });

  it('returns undefined when AccountInfo is missing cluster IDs', async () => {
    mockGetClusterCustomObject.mockReset();
    mockGetClusterCustomObject
      .mockResolvedValueOnce(STORE_RESPONSE)
      .mockResolvedValueOnce({ spec: { account: { originClusterId: '', generatedClusterId: '' } } });
    expect(await resolver.resolve('myorg')).toBeUndefined();
  });

  it('returns undefined on k8s API error', async () => {
    mockGetClusterCustomObject.mockReset();
    mockGetClusterCustomObject.mockRejectedValue(new Error('k8s error'));
    expect(await resolver.resolve('myorg')).toBeUndefined();
  });

  it('caches result and does not call k8s API on second resolve', async () => {
    await resolver.resolve('myorg');
    await resolver.resolve('myorg');
    expect(mockGetClusterCustomObject).toHaveBeenCalledTimes(2); // store + accountinfo, once
  });

  it('clearCache removes specific org from cache', async () => {
    await resolver.resolve('myorg');
    resolver.clearCache('myorg');
    mockGetClusterCustomObject
      .mockResolvedValueOnce(STORE_RESPONSE)
      .mockResolvedValueOnce(ACCOUNT_INFO_RESPONSE);
    await resolver.resolve('myorg');
    expect(mockGetClusterCustomObject).toHaveBeenCalledTimes(4);
  });

  it('clearCache with no args clears all', async () => {
    await resolver.resolve('myorg');
    resolver.clearCache();
    mockGetClusterCustomObject
      .mockResolvedValueOnce(STORE_RESPONSE)
      .mockResolvedValueOnce(ACCOUNT_INFO_RESPONSE);
    await resolver.resolve('myorg');
    expect(mockGetClusterCustomObject).toHaveBeenCalledTimes(4);
  });
});
