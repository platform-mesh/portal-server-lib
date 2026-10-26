import { NotFoundException } from '@nestjs/common';
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
const PROVIDER_WS = `${WORKSPACE_PROVIDERS}:httpbin`;

const makeWorkspace = (name: string) => ({ metadata: { name } });
const makeExport = (name: string) => ({
  apiVersion: 'apis.kcp.io/v1alpha1',
  kind: 'APIExport',
  metadata: { name },
});
const makePolicy = (exportName: string, policyName?: string) => ({
  apiVersion: 'core.platform-mesh.io/v1alpha1',
  kind: 'APIExportPolicy',
  metadata: { name: policyName ?? exportName },
  spec: { apiExportRef: { name: exportName, clusterPath: PROVIDER_WS } },
});

describe('ApiExportService', () => {
  let service: ApiExportService;
  const kcpK8s = mock<KcpKubernetesService>();

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ApiExportService(kcpK8s);
  });

  describe('listApiExports', () => {
    it('lists workspaces, then exports from each, merged with enabled flag', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock)
        .mockResolvedValueOnce({ items: [makeWorkspace('httpbin')] })           // workspaces
        .mockResolvedValueOnce({ items: [makeExport('alpha'), makeExport('beta')] }) // exports from httpbin
        .mockResolvedValueOnce({ items: [makePolicy('alpha')] });               // policies

      const result = await service.listApiExports(ORG);

      expect(result).toHaveLength(2);
      expect(result.find((e) => e.metadata.name === 'alpha')?.enabled).toBe(true);
      expect(result.find((e) => e.metadata.name === 'beta')?.enabled).toBe(false);
      expect(result.find((e) => e.metadata.name === 'alpha')?.clusterPath).toBe(PROVIDER_WS);
    });

    it('sets clusterPath from each provider workspace on returned exports', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock)
        .mockResolvedValueOnce({ items: [makeWorkspace('httpbin'), makeWorkspace('kro-provider')] })
        .mockResolvedValueOnce({ items: [makeExport('alpha')] })
        .mockResolvedValueOnce({ items: [makeExport('kro.run')] })
        .mockResolvedValueOnce({ items: [] });

      const result = await service.listApiExports(ORG);

      expect(result.find((e) => e.metadata.name === 'alpha')?.clusterPath).toBe(`${WORKSPACE_PROVIDERS}:httpbin`);
      expect(result.find((e) => e.metadata.name === 'kro.run')?.clusterPath).toBe(`${WORKSPACE_PROVIDERS}:kro-provider`);
    });

    it('returns empty array when workspace listing fails', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock).mockRejectedValueOnce(new Error('kcp unavailable'));

      const result = await service.listApiExports(ORG);

      expect(result).toEqual([]);
    });

    it('skips failed provider workspaces but returns others', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock)
        .mockResolvedValueOnce({ items: [makeWorkspace('httpbin'), makeWorkspace('kro-provider')] })
        .mockRejectedValueOnce(new Error('httpbin unavailable'))
        .mockResolvedValueOnce({ items: [makeExport('kro.run')] })
        .mockResolvedValueOnce({ items: [] });

      const result = await service.listApiExports(ORG);

      expect(result).toHaveLength(1);
      expect(result[0].metadata.name).toBe('kro.run');
    });

    it('returns exports with all disabled when policies fetch fails', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock)
        .mockResolvedValueOnce({ items: [makeWorkspace('httpbin')] })
        .mockResolvedValueOnce({ items: [makeExport('alpha')] })
        .mockRejectedValueOnce(new Error('policies unavailable'));

      const result = await service.listApiExports(ORG);

      expect(result).toHaveLength(1);
      expect(result[0].enabled).toBe(false);
    });
  });

  describe('enableApiExport', () => {
    it('creates APIExportPolicy with correct spec', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock).mockResolvedValueOnce({ items: [makeExport('alpha')] });
      (kcpK8s.createClusterCustomObject as jest.Mock).mockResolvedValue({});

      await service.enableApiExport(ORG, 'alpha', PROVIDER_WS);

      expect(kcpK8s.createClusterCustomObject).toHaveBeenCalledWith(
        expect.objectContaining({ plural: 'apiexportpolicies' }),
        `root:orgs:${ORG}`,
        expect.objectContaining({
          kind: 'APIExportPolicy',
          metadata: { name: 'alpha--httpbin' },
          spec: {
            apiExportRef: { name: 'alpha', clusterPath: PROVIDER_WS },
            allowPathExpressions: [`:root:orgs:${ORG}:*`],
          },
        }),
      );
    });

    it('throws NotFoundException when APIExport does not exist', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock).mockResolvedValueOnce({ items: [] });

      await expect(service.enableApiExport(ORG, 'nonexistent', PROVIDER_WS)).rejects.toThrow(NotFoundException);
      expect(kcpK8s.createClusterCustomObject).not.toHaveBeenCalled();
    });

    it('rethrows on create failure', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock).mockResolvedValueOnce({ items: [makeExport('alpha')] });
      (kcpK8s.createClusterCustomObject as jest.Mock).mockRejectedValue(Object.assign(new Error('conflict'), { statusCode: 409 }));

      await expect(service.enableApiExport(ORG, 'alpha', PROVIDER_WS)).rejects.toThrow('conflict');
    });
  });

  describe('disableApiExport', () => {
    it('finds policy by apiExportRef.name and deletes it', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock).mockResolvedValueOnce({
        items: [makePolicy('alpha', 'alpha--httpbin')],
      });
      (kcpK8s.deleteClusterCustomObject as jest.Mock).mockResolvedValue(undefined);

      await service.disableApiExport(ORG, 'alpha');

      expect(kcpK8s.deleteClusterCustomObject).toHaveBeenCalledWith(
        expect.objectContaining({ plural: 'apiexportpolicies' }),
        `root:orgs:${ORG}`,
        'alpha--httpbin',
      );
    });

    it('throws NotFoundException when no matching policy found', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock).mockResolvedValueOnce({ items: [] });

      await expect(service.disableApiExport(ORG, 'alpha')).rejects.toThrow(NotFoundException);
      expect(kcpK8s.deleteClusterCustomObject).not.toHaveBeenCalled();
    });

    it('rethrows on delete failure', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock).mockResolvedValueOnce({
        items: [makePolicy('alpha', 'alpha--httpbin')],
      });
      (kcpK8s.deleteClusterCustomObject as jest.Mock).mockRejectedValue(new Error('forbidden'));

      await expect(service.disableApiExport(ORG, 'alpha')).rejects.toThrow('forbidden');
    });
  });
});
