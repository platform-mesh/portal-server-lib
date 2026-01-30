import { K8sRequestContext, K8sResourceDescriptor } from '../models/k8s.js';
import { KcpKubernetesService } from './kcp-k8s.service.js';
import type { Request } from 'express';

const mockListClusterCustomObject = jest.fn();
const mockReadNamespacedSecret = jest.fn();
const mockMakeApiClient = jest.fn();
const mockGetCurrentCluster = jest.fn();
const mockLoadFromFile = jest.fn();
const mockAddUser = jest.fn();
const mockAddContext = jest.fn();
const mockSetCurrentContext = jest.fn();

jest.mock('@kubernetes/client-node', () => ({
  CustomObjectsApi: jest.fn().mockImplementation(() => ({
    listClusterCustomObject: mockListClusterCustomObject,
  })),
  CoreV1Api: jest.fn().mockImplementation(() => ({
    readNamespacedSecret: mockReadNamespacedSecret,
  })),
  KubeConfig: jest.fn().mockImplementation(() => ({
    loadFromFile: mockLoadFromFile,
    addUser: mockAddUser,
    addContext: mockAddContext,
    setCurrentContext: mockSetCurrentContext,
    getCurrentCluster: mockGetCurrentCluster,
    makeApiClient: mockMakeApiClient,
  })),
}));

jest.mock('../utils/domain.js', () => ({
  getOrganization: jest.fn(() => 'org-1'),
}));

jest.mock('@kubernetes/client-node/dist/gen/middleware.js', () => ({
  PromiseMiddlewareWrapper: class {
    constructor(public options: any) {}
  },
}));

describe('KcpKubernetesService', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...OLD_ENV,
      KUBECONFIG_KCP: '/tmp/kcp.kubeconfig',
      BASE_DOMAINS_DEFAULT: 'example.com',
    };

    mockGetCurrentCluster.mockReturnValue({
      server: 'https://kcp.example.com/base',
      name: 'test-cluster',
    });

    mockMakeApiClient.mockReturnValue({
      listClusterCustomObject: mockListClusterCustomObject,
      readNamespacedSecret: mockReadNamespacedSecret,
    });
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe('initialization', () => {
    it('initializes k8s client and baseUrl from kubeconfig', () => {
      const svc = new KcpKubernetesService();
      expect(svc.getKcpK8sCustomObjectsApiOIDCUser()).toBeDefined();
      expect(svc.getKcpWorkspaceUrl('org1', 'acc1').toString()).toBe(
        'https://kcp.example.com/clusters/root:orgs:org1:acc1',
      );
    });

    it('calls kubeconfig methods for OIDC user setup', () => {
      new KcpKubernetesService();
      expect(mockLoadFromFile).toHaveBeenCalledWith('/tmp/kcp.kubeconfig');
      expect(mockAddUser).toHaveBeenCalledWith({ name: 'oidc' });
      expect(mockAddContext).toHaveBeenCalledWith({
        name: 'oidc',
        user: 'oidc',
        cluster: 'test-cluster',
      });
      expect(mockSetCurrentContext).toHaveBeenCalledWith('oidc');
    });

    it('creates multiple API clients', () => {
      new KcpKubernetesService();
      expect(mockMakeApiClient).toHaveBeenCalledTimes(3);
    });
  });

  describe('getters', () => {
    it('returns custom objects API for OIDC user', () => {
      const svc = new KcpKubernetesService();
      const api = svc.getKcpK8sCustomObjectsApiOIDCUser();
      expect(api).toBeDefined();
    });

    it('returns custom objects API', () => {
      const svc = new KcpKubernetesService();
      const api = svc.getKcpK8sCustomObjectsApi();
      expect(api).toBeDefined();
    });

    it('returns core v1 API', () => {
      const svc = new KcpKubernetesService();
      const api = svc.getKcpK8sCoreV1Api();
      expect(api).toBeDefined();
    });
  });

  describe('workspace URL building', () => {
    it('builds workspace url with organization and account', () => {
      const svc = new KcpKubernetesService();
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

    it('builds workspace url without organization', () => {
      const svc = new KcpKubernetesService();
      expect(svc.getKcpWorkspaceUrl('', '').toString()).toBe(
        'https://kcp.example.com/clusters/root:orgs',
      );
    });

    it('builds workspace url with only organization', () => {
      const svc = new KcpKubernetesService();
      expect(svc.getKcpWorkspaceUrl('orgX').toString()).toBe(
        'https://kcp.example.com/clusters/root:orgs:orgX',
      );
    });

    it('builds workspace url without parameters', () => {
      const svc = new KcpKubernetesService();
      expect(svc.getKcpWorkspaceUrl().toString()).toBe(
        'https://kcp.example.com/clusters/root:orgs',
      );
    });
  });

  describe('virtual workspace URL building', () => {
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

  describe('getKcpWorkspacePublicUrl', () => {
    const makeReq = (overrides: Partial<Request> = {}): Request =>
      ({
        headers: {},
        query: {},
        ...overrides,
      }) as unknown as Request;

    it('builds URL with organization and account from query', () => {
      const svc = new KcpKubernetesService();
      const req = makeReq({
        query: { 'core_platform-mesh_io_account': 'acc-1' } as any,
        headers: { host: 'kcp.api.example.com' } as any,
      });

      const url = svc.getKcpWorkspacePublicUrl(req);
      expect(url).toBe(
        'https://kcp.api.example.com/clusters/root:orgs:org-1:acc-1',
      );
    });

    it('builds URL with KCP_URL parameter when provided', () => {
      const svc = new KcpKubernetesService();
      process.env.KCP_URL = 'https://my.com:6676';

      const req = makeReq({
        query: { 'core_platform-mesh_io_account': 'acc-1' } as any,
        headers: { host: 'kcp.api.example.com' } as any,
      });

      const url = svc.getKcpWorkspacePublicUrl(req);

      expect(url).toBe('https://my.com:6676/clusters/root:orgs:org-1:acc-1');
      delete process.env.KCP_URL;
    });

    it('omits port for standard port 80', () => {
      const svc = new KcpKubernetesService();
      const req = makeReq({
        query: { 'core_platform-mesh_io_account': 'acc' } as any,
        headers: { host: 'kcp.api.example.com:80' } as any,
      });
      expect(svc.getKcpWorkspacePublicUrl(req)).toBe(
        'https://kcp.api.example.com/clusters/root:orgs:org-1:acc',
      );
    });

    it('omits port for standard port 443', () => {
      const svc = new KcpKubernetesService();
      const req = makeReq({
        query: { 'core_platform-mesh_io_account': 'acc' } as any,
        headers: {
          'x-forwarded-port': '443',
          host: 'kcp.api.example.com',
        } as any,
      });
      expect(svc.getKcpWorkspacePublicUrl(req)).toBe(
        'https://kcp.api.example.com/clusters/root:orgs:org-1:acc',
      );
    });

    it('omits port when no port provided', () => {
      const svc = new KcpKubernetesService();
      const req = makeReq({
        query: { 'core_platform-mesh_io_account': 'acc' } as any,
        headers: { host: 'kcp.api.example.com' } as any,
      });
      expect(svc.getKcpWorkspacePublicUrl(req)).toBe(
        'https://kcp.api.example.com/clusters/root:orgs:org-1:acc',
      );
    });

    it('appends non-standard port from x-forwarded-port', () => {
      const svc = new KcpKubernetesService();
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

    it('handles x-forwarded-port as array', () => {
      const svc = new KcpKubernetesService();
      const req = makeReq({
        query: { 'core_platform-mesh_io_account': 'acc' } as any,
        headers: {
          'x-forwarded-port': ['9000', '8000'],
          host: 'kcp.api.example.com',
        } as any,
      });

      const url = svc.getKcpWorkspacePublicUrl(req);
      expect(url).toBe(
        'https://kcp.api.example.com:9000/clusters/root:orgs:org-1:acc',
      );
    });

    it('falls back to port from host header when x-forwarded-port not present', () => {
      const svc = new KcpKubernetesService();
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
      const svc = new KcpKubernetesService();
      const req = makeReq({
        query: { 'core_platform-mesh_io_account': 'acc' } as any,
        headers: { host: 'kcp.api.example.com' } as any,
      });

      const url = svc.getKcpWorkspacePublicUrl(req);
      expect(url).toBe(
        'https://kcp.api.example.com:4200/clusters/root:orgs:org-1:acc',
      );
    });

    it('prioritizes FRONTEND_PORT over x-forwarded-port', () => {
      process.env.FRONTEND_PORT = '5000';
      const svc = new KcpKubernetesService();
      const req = makeReq({
        query: { 'core_platform-mesh_io_account': 'acc' } as any,
        headers: {
          'x-forwarded-port': '8080',
          host: 'kcp.api.example.com',
        } as any,
      });

      const url = svc.getKcpWorkspacePublicUrl(req);
      expect(url).toBe(
        'https://kcp.api.example.com:5000/clusters/root:orgs:org-1:acc',
      );
    });

    it('builds URL without account when not in query', () => {
      const svc = new KcpKubernetesService();
      const req = makeReq({
        query: {} as any,
        headers: { host: 'kcp.api.example.com' } as any,
      });

      const url = svc.getKcpWorkspacePublicUrl(req);
      expect(url).toBe('https://kcp.api.example.com/clusters/root:orgs:org-1');
    });
  });

  describe('listClusterCustomObject', () => {
    it('calls API with correct workspace URL and parameters', async () => {
      const svc = new KcpKubernetesService();
      const gvr: K8sResourceDescriptor = {
        group: 'apps',
        version: 'v1',
        plural: 'deployments',
        name: 'my-deployment',
      };
      const context: K8sRequestContext = {
        organization: 'test-org',
        'core_platform-mesh_io_account': 'test-account',
      };

      mockListClusterCustomObject.mockResolvedValue({ data: {} });

      await svc.listClusterCustomObject(gvr, context);

      expect(mockListClusterCustomObject).toHaveBeenCalledWith(
        gvr,
        expect.objectContaining({
          middleware: expect.any(Array),
        }),
      );
    });

    it('executes post middleware', async () => {
      const svc = new KcpKubernetesService();
      const gvr: K8sResourceDescriptor = {
        group: 'apps',
        version: 'v1',
        plural: 'deployments',
        name: 'my-deployment',
      };
      const context: K8sRequestContext = {
        organization: 'org1',
        'core_platform-mesh_io_account': 'acc1',
      };

      let postResult: any;
      mockListClusterCustomObject.mockImplementation(async (_gvr, options) => {
        const middleware = options.middleware[0];
        const mockContext = {
          setUrl: jest.fn(),
        };
        await middleware.options.pre(mockContext);
        postResult = await middleware.options.post(mockContext);
        return { data: {} };
      });

      await svc.listClusterCustomObject(gvr, context);

      expect(postResult).toBeDefined();
    });

    it('builds correct URL path in middleware', async () => {
      const svc = new KcpKubernetesService();
      const gvr: K8sResourceDescriptor = {
        group: 'batch',
        version: 'v1',
        plural: 'jobs',
        name: 'test-job',
      };
      const context: K8sRequestContext = {
        organization: 'org1',
        'core_platform-mesh_io_account': 'acc1',
      };

      let capturedContext: any;
      mockListClusterCustomObject.mockImplementation(
        async (gvrParam, options) => {
          const middleware = options.middleware[0];
          const mockContext = {
            setUrl: jest.fn(),
          };
          capturedContext = mockContext;
          await middleware.options.pre(mockContext);
          return { data: {} };
        },
      );

      await svc.listClusterCustomObject(gvr, context);

      expect(capturedContext.setUrl).toHaveBeenCalledWith(
        'https://kcp.example.com/clusters/root:orgs:org1:acc1/apis/batch/v1/jobs/test-job',
      );
    });

    it('handles context without account', async () => {
      const svc = new KcpKubernetesService();
      const gvr: K8sResourceDescriptor = {
        group: 'core',
        version: 'v1',
        plural: 'pods',
        name: 'my-pod',
      };
      const context: K8sRequestContext = {
        organization: 'org2',
      };

      let capturedContext: any;
      mockListClusterCustomObject.mockImplementation(
        async (gvrParam, options) => {
          const middleware = options.middleware[0];
          const mockContext = {
            setUrl: jest.fn(),
          };
          capturedContext = mockContext;
          await middleware.options.pre(mockContext);
          return { data: {} };
        },
      );

      await svc.listClusterCustomObject(gvr, context);

      expect(capturedContext.setUrl).toHaveBeenCalledWith(
        'https://kcp.example.com/clusters/root:orgs:org2/apis/core/v1/pods/my-pod',
      );
    });
  });

  describe('listClusterCustomObjectInKcpVirtualWorkspace', () => {
    it('calls OIDC API with correct virtual workspace URL and token', async () => {
      const svc = new KcpKubernetesService();
      const gvr: K8sResourceDescriptor = {
        group: 'networking.k8s.io',
        version: 'v1',
        plural: 'ingresses',
        name: undefined,
      };
      const context: K8sRequestContext = {
        organization: 'virtual-org',
        'core_platform-mesh_io_account': 'virtual-acc',
      };
      const token = 'test-bearer-token';

      mockListClusterCustomObject.mockResolvedValue({ data: [] });

      await svc.listClusterCustomObjectInKcpVirtualWorkspace(
        gvr,
        context,
        token,
      );

      expect(mockListClusterCustomObject).toHaveBeenCalled();
    });

    it('sets Authorization header with Bearer token', async () => {
      const svc = new KcpKubernetesService();
      const gvr: K8sResourceDescriptor = {
        group: 'apps',
        version: 'v1',
        plural: 'statefulsets',
        name: undefined,
      };
      const context: K8sRequestContext = {
        organization: 'auth-org',
        'core_platform-mesh_io_account': 'auth-acc',
      };
      const token = 'my-secret-token';

      let capturedContext: any;
      mockListClusterCustomObject.mockImplementation(
        async (gvrParam, options) => {
          const middleware = options.middleware[0];
          const mockContext = {
            setUrl: jest.fn(),
            setHeaderParam: jest.fn(),
          };
          capturedContext = mockContext;
          await middleware.options.pre(mockContext);
          return { data: [] };
        },
      );

      await svc.listClusterCustomObjectInKcpVirtualWorkspace(
        gvr,
        context,
        token,
      );

      expect(capturedContext.setHeaderParam).toHaveBeenCalledWith(
        'Authorization',
        'Bearer my-secret-token',
      );
    });

    it('builds correct virtual workspace URL path', async () => {
      const svc = new KcpKubernetesService();
      const gvr: K8sResourceDescriptor = {
        group: 'rbac.authorization.k8s.io',
        version: 'v1',
        plural: 'roles',
        name: undefined,
      };
      const context: K8sRequestContext = {
        organization: 'rbac-org',
        'core_platform-mesh_io_account': 'rbac-acc',
      };

      let capturedContext: any;
      mockListClusterCustomObject.mockImplementation(
        async (gvrParam, options) => {
          const middleware = options.middleware[0];
          const mockContext = {
            setUrl: jest.fn(),
            setHeaderParam: jest.fn(),
          };
          capturedContext = mockContext;
          await middleware.options.pre(mockContext);
          return { data: [] };
        },
      );

      await svc.listClusterCustomObjectInKcpVirtualWorkspace(
        gvr,
        context,
        'token',
      );

      expect(capturedContext.setUrl).toHaveBeenCalledWith(
        'https://kcp.example.com/services/contentconfigurations/clusters/root:orgs:rbac-org:rbac-acc/apis/rbac.authorization.k8s.io/v1/roles',
      );
    });
  });

  describe('getClientSecret', () => {
    it('retrieves and decodes client secret successfully', async () => {
      const svc = new KcpKubernetesService();
      const orgName = 'test-org';
      const encodedSecret = Buffer.from('my-secret-value').toString('base64');

      mockReadNamespacedSecret.mockResolvedValue({
        data: {
          client_secret: encodedSecret,
        },
      });

      const result = await svc.getClientSecret(orgName);

      expect(result).toBe('my-secret-value');
      expect(mockReadNamespacedSecret).toHaveBeenCalledWith(
        {
          namespace: 'default',
          name: 'portal-client-secret-test-org-test-org',
        },
        expect.objectContaining({
          middleware: expect.any(Array),
        }),
      );
    });

    it('builds correct secret name and namespace', async () => {
      const svc = new KcpKubernetesService();
      const orgName = 'my-company';

      mockReadNamespacedSecret.mockResolvedValue({
        data: {
          client_secret: Buffer.from('secret').toString('base64'),
        },
      });

      await svc.getClientSecret(orgName);

      expect(mockReadNamespacedSecret).toHaveBeenCalledWith(
        {
          namespace: 'default',
          name: 'portal-client-secret-my-company-my-company',
        },
        expect.any(Object),
      );
    });

    it('uses correct workspace URL in middleware', async () => {
      const svc = new KcpKubernetesService();
      const orgName = 'url-org';

      let capturedContext: any;
      mockReadNamespacedSecret.mockImplementation(async (params, options) => {
        const middleware = options.middleware[0];
        const mockContext = {
          setUrl: jest.fn(),
        };
        capturedContext = mockContext;
        await middleware.options.pre(mockContext);
        return {
          data: {
            client_secret: Buffer.from('test').toString('base64'),
          },
        };
      });

      await svc.getClientSecret(orgName);

      expect(capturedContext.setUrl).toHaveBeenCalledWith(
        'https://kcp.example.com/clusters/root:orgs/api/v1/namespaces/default/secrets/portal-client-secret-url-org-url-org',
      );
    });

    it('executes post middleware', async () => {
      const svc = new KcpKubernetesService();
      const orgName = 'post-org';

      let postResult: any;
      mockReadNamespacedSecret.mockImplementation(async (_params, options) => {
        const middleware = options.middleware[0];
        const mockContext = {
          setUrl: jest.fn(),
        };
        await middleware.options.pre(mockContext);
        postResult = await middleware.options.post(mockContext);
        return {
          data: {
            client_secret: Buffer.from('test').toString('base64'),
          },
        };
      });

      await svc.getClientSecret(orgName);

      expect(postResult).toBeDefined();
    });

    it('throws error when secret retrieval fails', async () => {
      const svc = new KcpKubernetesService();
      const orgName = 'fail-org';
      const error = new Error('Secret not found');

      mockReadNamespacedSecret.mockRejectedValue(error);

      await expect(svc.getClientSecret(orgName)).rejects.toThrow(
        'Secret not found',
      );
    });

    it('logs error with secret name when retrieval fails', async () => {
      const svc = new KcpKubernetesService();
      const orgName = 'error-org';
      const error = {
        response: {
          body: { message: 'Not found' },
        },
      };

      mockReadNamespacedSecret.mockRejectedValue(error);

      await expect(svc.getClientSecret(orgName)).rejects.toEqual(error);
    });

    it('handles error without response body', async () => {
      const svc = new KcpKubernetesService();
      const orgName = 'no-response-org';
      const error = new Error('Network error');

      mockReadNamespacedSecret.mockRejectedValue(error);

      await expect(svc.getClientSecret(orgName)).rejects.toThrow(
        'Network error',
      );
    });
  });
});
