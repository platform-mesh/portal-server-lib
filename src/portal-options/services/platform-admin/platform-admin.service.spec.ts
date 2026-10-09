import { Test, TestingModule } from '@nestjs/testing';
import { mock } from 'jest-mock-extended';
import { KcpKubernetesService } from '../kcp-k8s.service.js';
import { PlatformAdminService } from './platform-admin.service.js';

jest.mock('@kubernetes/client-node/dist/gen/middleware.js', () => ({
  PromiseMiddlewareWrapper: class {
    constructor(public options: unknown) {}
  },
}));

jest.mock('@kubernetes/client-node', () => ({
  CustomObjectsApi: jest.fn(),
  CoreV1Api: jest.fn(),
  KubeConfig: jest.fn(),
}));

const mockListClusterCustomObject = jest.fn();
const mockCreateClusterCustomObject = jest.fn();
const mockPatchClusterCustomObject = jest.fn();
const mockDeleteClusterCustomObject = jest.fn();

const mockCustomObjectsApi = {
  listClusterCustomObject: mockListClusterCustomObject,
  createClusterCustomObject: mockCreateClusterCustomObject,
  patchClusterCustomObject: mockPatchClusterCustomObject,
  deleteClusterCustomObject: mockDeleteClusterCustomObject,
};

describe('PlatformAdminService', () => {
  let service: PlatformAdminService;
  let kcpK8s: jest.Mocked<KcpKubernetesService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    kcpK8s = mock<KcpKubernetesService>();
    kcpK8s.getKcpK8sCustomObjectsApi.mockReturnValue(mockCustomObjectsApi as never);
    kcpK8s.getKcpWorkspaceUrl.mockReturnValue(new URL('https://kcp.example.com/clusters/root'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformAdminService,
        { provide: KcpKubernetesService, useValue: kcpK8s },
      ],
    }).compile();

    service = module.get(PlatformAdminService);
  });

  describe('listApiExports', () => {
    it('returns api exports from all provider workspaces, filtered of core kcp exports', async () => {
      mockListClusterCustomObject
        .mockResolvedValueOnce({ items: [{ metadata: { name: 'acme' } }, { metadata: { name: 'beta' } }] })
        .mockResolvedValueOnce({ items: [{ metadata: { name: 'my-api' } }, { metadata: { name: 'tenancy.kcp.io' } }] })
        .mockResolvedValueOnce({ items: [{ metadata: { name: 'another-api' } }] });

      const result = await service.listApiExports();

      expect(result).toEqual([
        { name: 'my-api', clusterPath: 'root:providers:acme' },
        { name: 'another-api', clusterPath: 'root:providers:beta' },
      ]);
    });

    it('returns an empty array when there are no provider workspaces', async () => {
      mockListClusterCustomObject.mockResolvedValueOnce({ items: [] });

      await expect(service.listApiExports()).resolves.toEqual([]);
    });

    it('handles missing items in the list response', async () => {
      mockListClusterCustomObject
        .mockResolvedValueOnce({ items: [{ metadata: { name: 'acme' } }] })
        .mockResolvedValueOnce({});

      await expect(service.listApiExports()).resolves.toEqual([]);
    });
  });

  describe('listOrgs', () => {
    it('returns org names from root:orgs workspaces', async () => {
      mockListClusterCustomObject.mockResolvedValueOnce({
        items: [{ metadata: { name: 'org-a' } }, { metadata: { name: 'org-b' } }],
      });

      await expect(service.listOrgs()).resolves.toEqual([
        { name: 'org-a' },
        { name: 'org-b' },
      ]);
    });

    it('returns an empty array when there are no orgs', async () => {
      mockListClusterCustomObject.mockResolvedValueOnce({ items: [] });

      await expect(service.listOrgs()).resolves.toEqual([]);
    });
  });

  describe('listPolicies', () => {
    it('maps policy resources to PolicyEntry shape', async () => {
      mockListClusterCustomObject.mockResolvedValueOnce({
        items: [
          {
            metadata: { name: 'policy-1' },
            spec: {
              apiExportRef: { name: 'my-api', clusterPath: 'root:providers:acme' },
              allowPathExpressions: ['root:orgs:*'],
            },
          },
        ],
      });

      await expect(service.listPolicies()).resolves.toEqual([
        {
          name: 'policy-1',
          apiExportRef: { name: 'my-api', clusterPath: 'root:providers:acme' },
          allowPathExpressions: ['root:orgs:*'],
        },
      ]);
    });

    it('uses empty defaults for missing spec fields', async () => {
      mockListClusterCustomObject.mockResolvedValueOnce({
        items: [{ metadata: { name: 'bare-policy' } }],
      });

      await expect(service.listPolicies()).resolves.toEqual([
        {
          name: 'bare-policy',
          apiExportRef: { name: '', clusterPath: '' },
          allowPathExpressions: [],
        },
      ]);
    });
  });

  describe('createPolicy', () => {
    it('calls createClusterCustomObject with the correct resource body', async () => {
      mockCreateClusterCustomObject.mockResolvedValue(undefined);

      await service.createPolicy({
        name: 'my-policy',
        apiExportName: 'my-api',
        clusterPath: 'root:providers:acme',
        allowPathExpressions: ['root:orgs:*'],
      });

      expect(mockCreateClusterCustomObject).toHaveBeenCalledWith(
        expect.objectContaining({
          group: 'core.platform-mesh.io',
          version: 'v1alpha1',
          plural: 'apiexportpolicies',
          body: expect.objectContaining({
            metadata: { name: 'my-policy' },
            spec: {
              apiExportRef: { name: 'my-api', clusterPath: 'root:providers:acme' },
              allowPathExpressions: ['root:orgs:*'],
            },
          }),
        }),
        expect.objectContaining({ middleware: expect.any(Array) }),
      );
    });
  });

  describe('updatePolicy', () => {
    it('calls patchClusterCustomObject with the correct name and allowPathExpressions', async () => {
      mockPatchClusterCustomObject.mockResolvedValue(undefined);

      await service.updatePolicy('my-policy', { allowPathExpressions: ['root:orgs:acme'] });

      expect(mockPatchClusterCustomObject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'my-policy',
          body: { spec: { allowPathExpressions: ['root:orgs:acme'] } },
        }),
        expect.objectContaining({ middleware: expect.any(Array) }),
      );
    });
  });

  describe('deletePolicy', () => {
    it('calls deleteClusterCustomObject with the correct name', async () => {
      mockDeleteClusterCustomObject.mockResolvedValue(undefined);

      await service.deletePolicy('my-policy');

      expect(mockDeleteClusterCustomObject).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'my-policy' }),
        expect.objectContaining({ middleware: expect.any(Array) }),
      );
    });
  });
});
