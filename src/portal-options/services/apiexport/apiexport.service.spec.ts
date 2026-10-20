import { mock } from 'jest-mock-extended';
import { KcpKubernetesService } from '../kcp-k8s.service.js';
import { ApiExportService } from './apiexport.service.js';
import { WORKSPACE_PROVIDERS } from './constants.js';

jest.mock('@kubernetes/client-node', () => {
  class KubeConfig {
    loadFromFile = jest.fn();
    getCurrentCluster = jest.fn().mockReturnValue({ server: 'https://kcp.example.com', name: 'test' });
    makeApiClient = jest.fn();
    addUser = jest.fn();
    addContext = jest.fn();
    setCurrentContext = jest.fn();
  }
  class CustomObjectsApi {}
  class CoreV1Api {}
  return { KubeConfig, CustomObjectsApi, CoreV1Api };
});

jest.mock('@kubernetes/client-node/dist/gen/middleware.js', () => ({
  PromiseMiddlewareWrapper: jest.fn(),
}));

const ORG = 'test-org';

const makeExport = (name: string) => ({
  apiVersion: 'apis.kcp.io/v1alpha1',
  kind: 'APIExport',
  metadata: { name },
});

const makePolicy = (name: string) => ({
  apiVersion: 'core.platform-mesh.io/v1alpha1',
  kind: 'ApiExportPolicy',
  metadata: { name },
  spec: { apiExportRef: { name } },
});

describe('ApiExportService', () => {
  let service: ApiExportService;
  const kcpK8s = mock<KcpKubernetesService>();

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ApiExportService(kcpK8s);
  });

  describe('listApiExports', () => {
    it('merges exports with enabled flag from policies', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock)
        .mockResolvedValueOnce({ items: [makeExport('alpha'), makeExport('beta')] })
        .mockResolvedValueOnce({ items: [makePolicy('alpha')] });

      const result = await service.listApiExports(ORG);

      expect(result).toHaveLength(2);
      expect(result.find((e) => e.metadata.name === 'alpha')?.enabled).toBe(true);
      expect(result.find((e) => e.metadata.name === 'beta')?.enabled).toBe(false);
    });

    it('returns empty array when APIExports fetch fails', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock)
        .mockRejectedValueOnce(new Error('kcp unavailable'))
        .mockResolvedValueOnce({ items: [] });

      const result = await service.listApiExports(ORG);

      expect(result).toEqual([]);
    });

    it('returns exports with all disabled when policies fetch fails', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock)
        .mockResolvedValueOnce({ items: [makeExport('alpha')] })
        .mockRejectedValueOnce(new Error('policies unavailable'));

      const result = await service.listApiExports(ORG);

      expect(result).toHaveLength(1);
      expect(result[0].enabled).toBe(false);
    });

    it('handles missing items array in APIExports response', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock)
        .mockResolvedValueOnce({})  // no items field
        .mockResolvedValueOnce({ items: [] });

      const result = await service.listApiExports(ORG);
      expect(result).toEqual([]);
    });

    it('handles missing items array in policies response', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock)
        .mockResolvedValueOnce({ items: [makeExport('alpha')] })
        .mockResolvedValueOnce({});  // no items field

      const result = await service.listApiExports(ORG);
      expect(result).toHaveLength(1);
      expect(result[0].enabled).toBe(false);
    });

    it('calls exports from providers workspace', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock)
        .mockResolvedValueOnce({ items: [] })
        .mockResolvedValueOnce({ items: [] });

      await service.listApiExports(ORG);

      expect(kcpK8s.listClusterCustomObjects).toHaveBeenCalledWith(
        expect.objectContaining({ plural: 'apiexports' }),
        WORKSPACE_PROVIDERS,
      );
    });
  });

  describe('enableApiExport', () => {
    it('creates APIExportPolicy in org workspace', async () => {
      (kcpK8s.createClusterCustomObject as jest.Mock).mockResolvedValue({});

      await service.enableApiExport(ORG, 'alpha');

      expect(kcpK8s.createClusterCustomObject).toHaveBeenCalledWith(
        expect.objectContaining({ plural: 'apiexportpolicies' }),
        `root:orgs:${ORG}`,
        expect.objectContaining({ metadata: { name: 'alpha' } }),
      );
    });

    it('rethrows on create failure', async () => {
      (kcpK8s.createClusterCustomObject as jest.Mock).mockRejectedValue(new Error('conflict'));
      await expect(service.enableApiExport(ORG, 'alpha')).rejects.toThrow('conflict');
    });
  });

  describe('disableApiExport', () => {
    it('deletes APIExportPolicy from org workspace', async () => {
      (kcpK8s.deleteClusterCustomObject as jest.Mock).mockResolvedValue(undefined);

      await service.disableApiExport(ORG, 'alpha');

      expect(kcpK8s.deleteClusterCustomObject).toHaveBeenCalledWith(
        expect.objectContaining({ plural: 'apiexportpolicies' }),
        `root:orgs:${ORG}`,
        'alpha',
      );
    });

    it('rethrows on delete failure', async () => {
      (kcpK8s.deleteClusterCustomObject as jest.Mock).mockRejectedValue(new Error('not found'));
      await expect(service.disableApiExport(ORG, 'alpha')).rejects.toThrow('not found');
    });
  });
});
