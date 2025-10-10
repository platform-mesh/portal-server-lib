import { KcpKubernetesService } from './kcp-k8s.service.js';

jest.mock('@kubernetes/client-node', () => {
  const makeApiClient = jest.fn(() => ({}));
  const getCurrentCluster = jest.fn().mockReturnValue({
    server: 'https://kcp.example.com/base',
    name: 'test-cluster',
  });
  return {
    CustomObjectsApi: jest.fn(),
    KubeConfig: jest.fn().mockImplementation(() => ({
      loadFromFile: jest.fn(),
      addUser: jest.fn(),
      addContext: jest.fn(),
      setCurrentContext: jest.fn(),
      getCurrentCluster,
      makeApiClient,
    })),
  };
});

describe('KcpKubernetesService', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, KUBECONFIG_KCP: '/tmp/kcp.kubeconfig' };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('initializes k8s client and baseUrl from kubeconfig', () => {
    const svc = new KcpKubernetesService();
    expect(svc.getKcpK8sApiClient()).toBeDefined();
    expect(svc.getKcpWorkspaceUrl('org1', 'acc1').toString()).toBe(
      'https://kcp.example.com/clusters/root:orgs:org1:acc1',
    );
  });

  it('builds workspace url without account', () => {
    const svc = new KcpKubernetesService();
    expect(svc.getKcpWorkspaceUrl('org1', '').toString()).toBe(
      'https://kcp.example.com/clusters/root:orgs:org1',
    );
  });

  it('builds virtual workspace url with account', () => {
    const svc = new KcpKubernetesService();
    expect(svc.getKcpVirtualWorkspaceUrl('orgX', 'accY').toString()).toBe(
      'https://kcp.example.com/services/contentconfigurations/clusters/root:orgs:orgX:accY',
    );
  });

  it('builds virtual workspace url without account', () => {
    const svc = new KcpKubernetesService();
    expect(svc.getKcpVirtualWorkspaceUrl('orgX', '').toString()).toBe(
      'https://kcp.example.com/services/contentconfigurations/clusters/root:orgs:orgX',
    );
  });
});
