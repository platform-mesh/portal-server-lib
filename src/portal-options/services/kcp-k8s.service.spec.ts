import { KcpKubernetesService } from './kcp-k8s.service.js';
import type { Request } from 'express';

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

jest.mock('../utils/domain.js', () => ({
  getOrganization: jest.fn(() => 'org-1'),
}));

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

  describe('KcpKubernetesService - getKcpWorkspacePublicUrl', () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...ORIGINAL_ENV };
      process.env.BASE_DOMAINS_DEFAULT = 'example.com';
      process.env.KUBECONFIG_KCP = __filename; // loadFromFile is called; path must exist
    });

    afterEach(() => {
      process.env = ORIGINAL_ENV;
      jest.restoreAllMocks();
    });

    const createService = () => {
      // Mock KubeConfig internals to avoid reading real kubeconfig/server
      const loadFromFile = jest.fn();
      const addUser = jest.fn();
      const addContext = jest.fn();
      const setCurrentContext = jest.fn();
      const getCurrentCluster = jest.fn(
        () => ({ name: 'c', server: 'https://kcp.internal' }) as any,
      );
      const makeApiClient = jest.fn(() => ({}));

      jest.doMock('@kubernetes/client-node', () => {
        return {
          KubeConfig: jest.fn().mockImplementation(() => ({
            loadFromFile,
            addUser,
            addContext,
            setCurrentContext,
            getCurrentCluster,
            makeApiClient,
          })),
          CustomObjectsApi: jest.fn(),
        };
      });

      // Re-require module to use mocked client-node
      const { KcpKubernetesService: Svc } = require('./kcp-k8s.service');
      return new Svc() as KcpKubernetesService;
    };

    const makeReq = (overrides: Partial<Request> = {}): Request =>
      ({
        headers: {},
        query: {},
        ...overrides,
      }) as unknown as Request;

    it('builds URL with organization and account from query', () => {
      const svc = createService();
      const req = makeReq({
        query: { 'core_platform-mesh_io_account': 'acc-1' } as any,
        headers: { host: 'kcp.api.example.com' } as any,
      });

      const url = svc.getKcpWorkspacePublicUrl(req);
      expect(url).toBe(
        'https://kcp.api.example.com/clusters/root:orgs:org-1:acc-1',
      );
    });

    it('omits port for standard ports 80/443 and empty', () => {
      const svc = createService();

      let req = makeReq({
        query: { 'core_platform-mesh_io_account': 'acc' } as any,
        headers: { host: 'kcp.api.example.com:80' } as any,
      });
      expect(svc.getKcpWorkspacePublicUrl(req)).toBe(
        'https://kcp.api.example.com/clusters/root:orgs:org-1:acc',
      );

      req = makeReq({
        query: { 'core_platform-mesh_io_account': 'acc' } as any,
        headers: {
          'x-forwarded-port': '443',
          host: 'kcp.api.example.com',
        } as any,
      });
      expect(svc.getKcpWorkspacePublicUrl(req)).toBe(
        'https://kcp.api.example.com/clusters/root:orgs:org-1:acc',
      );

      req = makeReq({
        query: { 'core_platform-mesh_io_account': 'acc' } as any,
        headers: { host: 'kcp.api.example.com' } as any,
      });
      expect(svc.getKcpWorkspacePublicUrl(req)).toBe(
        'https://kcp.api.example.com/clusters/root:orgs:org-1:acc',
      );
    });

    it('appends non-standard port from x-forwarded-port', () => {
      const svc = createService();
      const req = makeReq({
        query: { 'core_platform-mesh_io_account': 'acc' } as any,
        headers: {
          'x-forwarded-port': '8443',
          host: 'kcp.api.example.com',
        } as any,
      });

      const url = svc.getKcpWorkspacePublicUrl(req);
      expect(url).toBe(
        'https://kcp.api.example.com:8443/clusters/root:orgs:org-1:acc',
      );
    });

    it('falls back to port from host header when x-forwarded-port not present', () => {
      const svc = createService();
      const req = makeReq({
        query: { 'core_platform-mesh_io_account': 'acc' } as any,
        headers: { host: 'kcp.api.example.com:3000' } as any,
      });

      const url = svc.getKcpWorkspacePublicUrl(req);
      expect(url).toBe(
        'https://kcp.api.example.com:3000/clusters/root:orgs:org-1:acc',
      );
    });

    it('uses FRONTEND_PORT env when provided', () => {
      process.env.FRONTEND_PORT = '4200';
      const svc = createService();
      const req = makeReq({
        query: { 'core_platform-mesh_io_account': 'acc' } as any,
        headers: { host: 'kcp.api.example.com' } as any,
      });

      const url = svc.getKcpWorkspacePublicUrl(req);
      expect(url).toBe(
        'https://kcp.api.example.com:4200/clusters/root:orgs:org-1:acc',
      );
    });
  });
});
