import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { mock } from 'jest-mock-extended';
import { ApiException } from '@kubernetes/client-node/dist/gen/apis/exception.js';
import { KcpKubernetesService } from '../kcp-k8s.service.js';
import {
  allowRuleToExpression,
  ApiExportService,
  expressionToAllowRule,
  mapK8sError,
  policyName,
  validateAllowRules,
  validateApiExportName,
  validateClusterPath,
} from './apiexport.service.js';
import { WORKSPACE_POLICY_HOME, WORKSPACE_PROVIDERS } from './constants.js';

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

/** Create a real ApiException with the given HTTP status code (2.x shape) */
function makeApiException(code: number): ApiException<unknown> {
  return new ApiException(code, `HTTP ${code}`, {}, {});
}

const ORG = 'test-org';
const PROVIDER_WS = `${WORKSPACE_PROVIDERS}:httpbin`;

function makeWorkspace(name: string) {
  return { metadata: { name } };
}

function makeExport(name: string, clusterPath = PROVIDER_WS) {
  return {
    apiVersion: 'apis.kcp.io/v1alpha1',
    kind: 'APIExport',
    metadata: { name },
    _clusterPath: clusterPath, // helper for test assertions
  };
}

function makePolicy(exportName: string, clusterPath: string, expressions: string[], resourceVersion = '1') {
  return {
    apiVersion: 'core.platform-mesh.io/v1alpha1',
    kind: 'APIExportPolicy',
    metadata: { name: policyName(exportName, clusterPath), resourceVersion },
    spec: { apiExportRef: { name: exportName, clusterPath }, allowPathExpressions: expressions },
  };
}

describe('utility functions', () => {
  describe('allowRuleToExpression', () => {
    it('converts exact path', () => {
      expect(allowRuleToExpression({ path: 'root:orgs:demo', includeDescendants: false })).toBe(':root:orgs:demo');
    });
    it('converts descendants path', () => {
      expect(allowRuleToExpression({ path: 'root:orgs:demo', includeDescendants: true })).toBe(':root:orgs:demo:*');
    });
    it('converts all-orgs wildcard', () => {
      expect(allowRuleToExpression({ path: 'root:orgs', includeDescendants: true })).toBe(':root:orgs:*');
    });
  });

  describe('expressionToAllowRule', () => {
    it('parses exact expression', () => {
      expect(expressionToAllowRule(':root:orgs:demo')).toEqual({ path: 'root:orgs:demo', includeDescendants: false });
    });
    it('parses descendants expression', () => {
      expect(expressionToAllowRule(':root:orgs:demo:*')).toEqual({ path: 'root:orgs:demo', includeDescendants: true });
    });
    it('parses all-orgs expression', () => {
      expect(expressionToAllowRule(':root:orgs:*')).toEqual({ path: 'root:orgs', includeDescendants: true });
    });
    it('returns null for invalid expression', () => {
      expect(expressionToAllowRule(':root:providers:x')).toBeNull();
    });
  });

  describe('policyName', () => {
    it('produces stable names', () => {
      const n1 = policyName('alpha', 'root:providers:httpbin');
      const n2 = policyName('alpha', 'root:providers:httpbin');
      expect(n1).toBe(n2);
    });
    it('distinguishes same name different provider', () => {
      const n1 = policyName('alpha', 'root:providers:httpbin');
      const n2 = policyName('alpha', 'root:providers:kro');
      expect(n1).not.toBe(n2);
    });
    it('produces Kubernetes-valid names (lowercase alphanumeric + hyphens)', () => {
      const n = policyName('orchestrate.platform-mesh.io', 'root:providers:httpbin');
      expect(n).toMatch(/^[a-z0-9][a-z0-9\-.]*[a-z0-9]$/);
    });
    it('handles names with only invalid leading chars', () => {
      const n = policyName('---bad', 'root:providers:httpbin');
      expect(n).toMatch(/^[a-z0-9]/);
    });
    it('returns policy-<hash> when export name has no alphanumeric chars', () => {
      const n = policyName('---', 'root:providers:httpbin');
      expect(n).toMatch(/^policy-[0-9a-f]{10}$/);
    });
  });

  describe('validateApiExportName', () => {
    it('accepts valid k8s names', () => {
      expect(() => validateApiExportName('alpha')).not.toThrow();
      expect(() => validateApiExportName('a.b.c')).not.toThrow();
      expect(() => validateApiExportName('my-export-123')).not.toThrow();
    });
    it('rejects empty name', () => {
      expect(() => validateApiExportName('')).toThrow(BadRequestException);
    });
    it('rejects names with invalid chars', () => {
      expect(() => validateApiExportName('UPPER')).toThrow(BadRequestException);
      expect(() => validateApiExportName('has space')).toThrow(BadRequestException);
    });
  });

  describe('validateClusterPath', () => {
    it('accepts valid provider paths', () => {
      expect(() => validateClusterPath('root:providers:httpbin')).not.toThrow();
      expect(() => validateClusterPath('root:providers:my-provider:sub')).not.toThrow();
    });
    it('rejects empty string', () => {
      expect(() => validateClusterPath('')).toThrow(BadRequestException);
    });
    it('rejects missing prefix', () => {
      expect(() => validateClusterPath('root:orgs:something')).toThrow(BadRequestException);
    });
    it('rejects bare providers path without child', () => {
      expect(() => validateClusterPath('root:providers')).toThrow(BadRequestException);
    });
    it('rejects invalid segment chars', () => {
      expect(() => validateClusterPath('root:providers:HAS_UPPER')).toThrow(BadRequestException);
    });
  });

  describe('validateAllowRules', () => {
    it('accepts empty array', () => {
      expect(() => validateAllowRules([])).not.toThrow();
    });
    it('accepts valid exact rule', () => {
      expect(() => validateAllowRules([{ path: 'root:orgs:demo', includeDescendants: false }])).not.toThrow();
    });
    it('accepts valid descendants rule', () => {
      expect(() => validateAllowRules([{ path: 'root:orgs:demo', includeDescendants: true }])).not.toThrow();
    });
    it('accepts all-orgs rule', () => {
      expect(() => validateAllowRules([{ path: 'root:orgs', includeDescendants: true }])).not.toThrow();
    });
    it('rejects non-array', () => {
      expect(() => validateAllowRules(null as any)).toThrow(BadRequestException);
    });
    it('rejects rule with non-string path', () => {
      expect(() => validateAllowRules([{ path: 123 as any, includeDescendants: false }])).toThrow(BadRequestException);
    });
    it('rejects rule with non-boolean includeDescendants', () => {
      expect(() => validateAllowRules([{ path: 'root:orgs:demo', includeDescendants: 'yes' as any }])).toThrow(BadRequestException);
    });
    it('rejects invalid all-orgs exact', () => {
      expect(() => validateAllowRules([{ path: 'root:orgs', includeDescendants: false }])).toThrow(BadRequestException);
    });
    it('rejects path with trailing colon (empty segment)', () => {
      expect(() => validateAllowRules([{ path: 'root:orgs:', includeDescendants: false }])).toThrow(BadRequestException);
    });
    it('rejects wildcard in path string (caught by segment validation)', () => {
      expect(() => validateAllowRules([{ path: 'root:orgs:demo:*', includeDescendants: false }])).toThrow(BadRequestException);
    });
    it('rejects non-orgs prefix', () => {
      expect(() => validateAllowRules([{ path: 'root:providers:x', includeDescendants: false }])).toThrow(BadRequestException);
    });
    it('rejects duplicate rules', () => {
      const rule = { path: 'root:orgs:demo', includeDescendants: false };
      expect(() => validateAllowRules([rule, rule])).toThrow(BadRequestException);
    });
    it('rejects multiple rules where one is invalid', () => {
      expect(() => validateAllowRules([
        { path: 'root:orgs:demo', includeDescendants: false },
        { path: 'root:orgs', includeDescendants: false },
      ])).toThrow(BadRequestException);
    });
  });

  describe('mapK8sError', () => {
    const logger = { error: jest.fn() } as any;
    it('rethrows NestJS HttpException unchanged', () => {
      const err = new NotFoundException('already a nest error');
      expect(() => mapK8sError(err, 'ctx', logger)).toThrow(NotFoundException);
    });
    it('maps ApiException code 404 to NotFoundException', () => {
      expect(() => mapK8sError(makeApiException(404), 'ctx', logger)).toThrow(NotFoundException);
    });
    it('maps ApiException code 409 to ConflictException', () => {
      expect(() => mapK8sError(makeApiException(409), 'ctx', logger)).toThrow(ConflictException);
    });
    it('maps ApiException code 403 to ForbiddenException', () => {
      expect(() => mapK8sError(makeApiException(403), 'ctx', logger)).toThrow(ForbiddenException);
    });
    it('maps ApiException code 422 to UnprocessableEntityException', () => {
      expect(() => mapK8sError(makeApiException(422), 'ctx', logger)).toThrow(UnprocessableEntityException);
    });
    it('maps unknown error to InternalServerErrorException', () => {
      expect(() => mapK8sError(new Error('oops'), 'ctx', logger)).toThrow(InternalServerErrorException);
    });
  });
});

describe('ApiExportService', () => {
  let service: ApiExportService;
  const kcpK8s = mock<KcpKubernetesService>();

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ApiExportService(kcpK8s);
  });

  // ─── listApiExports ───────────────────────────────────────────────────────

  describe('listApiExports', () => {
    it('returns exports with clusterPath and allowRules from policies', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock)
        .mockResolvedValueOnce({ items: [makeWorkspace('httpbin')] })
        .mockResolvedValueOnce({ items: [makeExport('alpha'), makeExport('beta')] })
        .mockResolvedValueOnce({ items: [makePolicy('alpha', PROVIDER_WS, [':root:orgs:demo'])] });

      const result = await service.listApiExports();

      expect(result).toHaveLength(2);
      const alpha = result.find((e) => e.metadata.name === 'alpha')!;
      expect(alpha.clusterPath).toBe(PROVIDER_WS);
      expect(alpha.allowRules).toEqual([{ path: 'root:orgs:demo', includeDescendants: false }]);
      const beta = result.find((e) => e.metadata.name === 'beta')!;
      expect(beta.allowRules).toEqual([]);
    });

    it('supports two same-named exports from different providers', async () => {
      const ws2 = `${WORKSPACE_PROVIDERS}:kro`;
      (kcpK8s.listClusterCustomObjects as jest.Mock)
        .mockResolvedValueOnce({ items: [makeWorkspace('httpbin'), makeWorkspace('kro')] })
        .mockResolvedValueOnce({ items: [makeExport('alpha', PROVIDER_WS)] })
        .mockResolvedValueOnce({ items: [makeExport('alpha', ws2)] })
        .mockResolvedValueOnce({
          items: [
            makePolicy('alpha', PROVIDER_WS, [':root:orgs:demo']),
            makePolicy('alpha', ws2, [':root:orgs:*']),
          ],
        });

      const result = await service.listApiExports();

      expect(result).toHaveLength(2);
      const httpbinExport = result.find((e) => e.clusterPath === PROVIDER_WS)!;
      expect(httpbinExport.allowRules).toEqual([{ path: 'root:orgs:demo', includeDescendants: false }]);
      const kroExport = result.find((e) => e.clusterPath === ws2)!;
      expect(kroExport.allowRules).toEqual([{ path: 'root:orgs', includeDescendants: true }]);
    });

    it('throws when provider workspaces cannot be listed', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock).mockRejectedValueOnce(makeApiException(403));

      await expect(service.listApiExports()).rejects.toThrow(InternalServerErrorException);
    });

    it('throws when a provider exports listing fails', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock)
        .mockResolvedValueOnce({ items: [makeWorkspace('httpbin')] })
        .mockRejectedValueOnce(makeApiException(403))
        .mockResolvedValueOnce({ items: [] });

      await expect(service.listApiExports()).rejects.toThrow(InternalServerErrorException);
    });

    it('throws when policy listing fails', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock)
        .mockResolvedValueOnce({ items: [makeWorkspace('httpbin')] })
        .mockResolvedValueOnce({ items: [makeExport('alpha')] })
        .mockRejectedValueOnce(makeApiException(403));

      await expect(service.listApiExports()).rejects.toThrow(InternalServerErrorException);
    });

    it('returns exports from providers workspace list', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock)
        .mockResolvedValueOnce({ items: [makeWorkspace('httpbin')] })
        .mockResolvedValueOnce({ items: [] })
        .mockResolvedValueOnce({ items: [] });

      await service.listApiExports();

      expect(kcpK8s.listClusterCustomObjects).toHaveBeenCalledWith(
        expect.objectContaining({ plural: 'workspaces' }),
        WORKSPACE_PROVIDERS,
      );
      expect(kcpK8s.listClusterCustomObjects).toHaveBeenCalledWith(
        expect.objectContaining({ plural: 'apiexports' }),
        PROVIDER_WS,
      );
    });

    it('loads policies from root:orgs', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock)
        .mockResolvedValueOnce({ items: [] })
        .mockResolvedValueOnce({ items: [] });

      await service.listApiExports();

      expect(kcpK8s.listClusterCustomObjects).toHaveBeenCalledWith(
        expect.objectContaining({ plural: 'apiexportpolicies' }),
        WORKSPACE_POLICY_HOME,
      );
    });

    it('returns empty list when no provider workspaces exist', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock)
        .mockResolvedValueOnce({ items: [] })
        .mockResolvedValueOnce({ items: [] });

      const result = await service.listApiExports();
      expect(result).toEqual([]);
    });

    it('correctly maps include-descendants and all-orgs rules', async () => {
      (kcpK8s.listClusterCustomObjects as jest.Mock)
        .mockResolvedValueOnce({ items: [makeWorkspace('httpbin')] })
        .mockResolvedValueOnce({ items: [makeExport('alpha')] })
        .mockResolvedValueOnce({
          items: [
            makePolicy('alpha', PROVIDER_WS, [':root:orgs:demo:*', ':root:orgs:*', ':root:orgs:prod']),
          ],
        });

      const result = await service.listApiExports();
      const alpha = result.find((e) => e.metadata.name === 'alpha')!;
      expect(alpha.allowRules).toEqual([
        { path: 'root:orgs:demo', includeDescendants: true },
        { path: 'root:orgs', includeDescendants: true },
        { path: 'root:orgs:prod', includeDescendants: false },
      ]);
    });
  });

  // ─── setApiExportPolicy ───────────────────────────────────────────────────

  describe('setApiExportPolicy', () => {
    const validRules = [{ path: 'root:orgs:demo', includeDescendants: false }];

    it('rejects invalid export name', async () => {
      await expect(
        service.setApiExportPolicy('INVALID', { clusterPath: PROVIDER_WS, allowRules: validRules }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid clusterPath', async () => {
      await expect(
        service.setApiExportPolicy('alpha', { clusterPath: 'root:orgs:x', allowRules: validRules }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate allowRules', async () => {
      const rule = { path: 'root:orgs:demo', includeDescendants: false };
      await expect(
        service.setApiExportPolicy('alpha', { clusterPath: PROVIDER_WS, allowRules: [rule, rule] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when export does not exist', async () => {
      (kcpK8s.getClusterCustomObject as jest.Mock).mockRejectedValueOnce(makeApiException(404));

      await expect(
        service.setApiExportPolicy('no-exist', { clusterPath: PROVIDER_WS, allowRules: validRules }),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates policy when no existing one', async () => {
      (kcpK8s.getClusterCustomObject as jest.Mock)
        .mockResolvedValueOnce(makeExport('alpha')) // export exists
        .mockRejectedValueOnce(makeApiException(404)); // policy does not exist
      (kcpK8s.createClusterCustomObject as jest.Mock).mockResolvedValueOnce({});

      await service.setApiExportPolicy('alpha', { clusterPath: PROVIDER_WS, allowRules: validRules });

      expect(kcpK8s.createClusterCustomObject).toHaveBeenCalledWith(
        expect.objectContaining({ plural: 'apiexportpolicies' }),
        WORKSPACE_POLICY_HOME,
        expect.objectContaining({
          kind: 'APIExportPolicy',
          spec: expect.objectContaining({
            apiExportRef: { name: 'alpha', clusterPath: PROVIDER_WS },
            allowPathExpressions: [':root:orgs:demo'],
          }),
        }),
      );
    });

    it('updates existing policy with correct resourceVersion', async () => {
      const existingPolicy = makePolicy('alpha', PROVIDER_WS, [':root:orgs:old'], '42');
      (kcpK8s.getClusterCustomObject as jest.Mock)
        .mockResolvedValueOnce(makeExport('alpha'))
        .mockResolvedValueOnce(existingPolicy);
      (kcpK8s.replaceClusterCustomObject as jest.Mock).mockResolvedValueOnce({});

      await service.setApiExportPolicy('alpha', { clusterPath: PROVIDER_WS, allowRules: validRules });

      expect(kcpK8s.replaceClusterCustomObject).toHaveBeenCalledWith(
        expect.objectContaining({ plural: 'apiexportpolicies' }),
        WORKSPACE_POLICY_HOME,
        policyName('alpha', PROVIDER_WS),
        expect.objectContaining({
          metadata: expect.objectContaining({ resourceVersion: '42' }),
          spec: expect.objectContaining({ allowPathExpressions: [':root:orgs:demo'] }),
        }),
      );
    });

    it('idempotent when identical PUT is repeated', async () => {
      const existingPolicy = makePolicy('alpha', PROVIDER_WS, [':root:orgs:demo'], '1');
      (kcpK8s.getClusterCustomObject as jest.Mock)
        .mockResolvedValueOnce(makeExport('alpha'))
        .mockResolvedValueOnce(existingPolicy);
      (kcpK8s.replaceClusterCustomObject as jest.Mock).mockResolvedValueOnce({});

      await expect(
        service.setApiExportPolicy('alpha', { clusterPath: PROVIDER_WS, allowRules: validRules }),
      ).resolves.toBeUndefined();
    });

    it('deletes policy when allowRules is empty', async () => {
      (kcpK8s.getClusterCustomObject as jest.Mock).mockResolvedValueOnce(makeExport('alpha'));
      (kcpK8s.deleteClusterCustomObject as jest.Mock).mockResolvedValueOnce(undefined);

      await service.setApiExportPolicy('alpha', { clusterPath: PROVIDER_WS, allowRules: [] });

      expect(kcpK8s.deleteClusterCustomObject).toHaveBeenCalledWith(
        expect.objectContaining({ plural: 'apiexportpolicies' }),
        WORKSPACE_POLICY_HOME,
        policyName('alpha', PROVIDER_WS),
      );
    });

    it('is idempotent when deleting already-absent policy', async () => {
      (kcpK8s.getClusterCustomObject as jest.Mock).mockResolvedValueOnce(makeExport('alpha'));
      (kcpK8s.deleteClusterCustomObject as jest.Mock).mockRejectedValueOnce(makeApiException(404));

      await expect(
        service.setApiExportPolicy('alpha', { clusterPath: PROVIDER_WS, allowRules: [] }),
      ).resolves.toBeUndefined();
    });

    it('resolves create/update race (409 on create → get + replace)', async () => {
      const existingPolicy = makePolicy('alpha', PROVIDER_WS, [':root:orgs:old'], '5');
      (kcpK8s.getClusterCustomObject as jest.Mock)
        .mockResolvedValueOnce(makeExport('alpha')) // export check
        .mockRejectedValueOnce(makeApiException(404)) // policy not found
        .mockResolvedValueOnce(existingPolicy); // re-fetch after 409
      (kcpK8s.createClusterCustomObject as jest.Mock).mockRejectedValueOnce(makeApiException(409));
      (kcpK8s.replaceClusterCustomObject as jest.Mock).mockResolvedValueOnce({});

      await service.setApiExportPolicy('alpha', { clusterPath: PROVIDER_WS, allowRules: validRules });

      expect(kcpK8s.replaceClusterCustomObject).toHaveBeenCalledWith(
        expect.objectContaining({ plural: 'apiexportpolicies' }),
        WORKSPACE_POLICY_HOME,
        policyName('alpha', PROVIDER_WS),
        expect.objectContaining({ metadata: expect.objectContaining({ resourceVersion: '5' }) }),
      );
    });

    it('maps ApiException 403 to ForbiddenException on export check', async () => {
      (kcpK8s.getClusterCustomObject as jest.Mock).mockRejectedValueOnce(makeApiException(403));

      await expect(
        service.setApiExportPolicy('alpha', { clusterPath: PROVIDER_WS, allowRules: validRules }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('maps ApiException 422 when creating policy', async () => {
      (kcpK8s.getClusterCustomObject as jest.Mock)
        .mockResolvedValueOnce(makeExport('alpha'))
        .mockRejectedValueOnce(makeApiException(404));
      (kcpK8s.createClusterCustomObject as jest.Mock).mockRejectedValueOnce(makeApiException(422));

      await expect(
        service.setApiExportPolicy('alpha', { clusterPath: PROVIDER_WS, allowRules: validRules }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rethrows NestJS HttpException from nested call unchanged', async () => {
      const nestErr = new NotFoundException('already nest');
      (kcpK8s.getClusterCustomObject as jest.Mock).mockRejectedValueOnce(nestErr);

      await expect(
        service.setApiExportPolicy('alpha', { clusterPath: PROVIDER_WS, allowRules: validRules }),
      ).rejects.toThrow(NotFoundException);
    });

    it('produces stable, collision-resistant policy names', async () => {
      const name1 = policyName('alpha', PROVIDER_WS);
      const name2 = policyName('alpha', `${WORKSPACE_PROVIDERS}:kro`);
      expect(name1).not.toBe(name2);
      expect(name1).toMatch(/^[a-z0-9][a-z0-9\-.]*[a-z0-9]$/);
      expect(name2).toMatch(/^[a-z0-9][a-z0-9\-.]*[a-z0-9]$/);
    });

    it('does not overwrite status fields (status absent from PUT body)', async () => {
      const existingPolicy = makePolicy('alpha', PROVIDER_WS, [':root:orgs:old'], '3');
      (kcpK8s.getClusterCustomObject as jest.Mock)
        .mockResolvedValueOnce(makeExport('alpha'))
        .mockResolvedValueOnce(existingPolicy);
      (kcpK8s.replaceClusterCustomObject as jest.Mock).mockResolvedValueOnce({});

      await service.setApiExportPolicy('alpha', { clusterPath: PROVIDER_WS, allowRules: validRules });

      const replacedBody = (kcpK8s.replaceClusterCustomObject as jest.Mock).mock.calls[0][3];
      expect(replacedBody).not.toHaveProperty('status');
    });

    it('throws InternalServerErrorException on unexpected export check error', async () => {
      (kcpK8s.getClusterCustomObject as jest.Mock).mockRejectedValueOnce(new Error('unexpected'));

      await expect(
        service.setApiExportPolicy('alpha', { clusterPath: PROVIDER_WS, allowRules: validRules }),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('propagates non-404 error when deleting policy', async () => {
      (kcpK8s.getClusterCustomObject as jest.Mock).mockResolvedValueOnce(makeExport('alpha'));
      (kcpK8s.deleteClusterCustomObject as jest.Mock).mockRejectedValueOnce(makeApiException(403));

      await expect(
        service.setApiExportPolicy('alpha', { clusterPath: PROVIDER_WS, allowRules: [] }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('propagates non-404 error when reading existing policy', async () => {
      (kcpK8s.getClusterCustomObject as jest.Mock)
        .mockResolvedValueOnce(makeExport('alpha'))
        .mockRejectedValueOnce(makeApiException(403));

      await expect(
        service.setApiExportPolicy('alpha', { clusterPath: PROVIDER_WS, allowRules: validRules }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('maps error when replacing existing policy', async () => {
      const existingPolicy = makePolicy('alpha', PROVIDER_WS, [':root:orgs:old'], '3');
      (kcpK8s.getClusterCustomObject as jest.Mock)
        .mockResolvedValueOnce(makeExport('alpha'))
        .mockResolvedValueOnce(existingPolicy);
      (kcpK8s.replaceClusterCustomObject as jest.Mock).mockRejectedValueOnce(makeApiException(409));

      await expect(
        service.setApiExportPolicy('alpha', { clusterPath: PROVIDER_WS, allowRules: validRules }),
      ).rejects.toThrow(ConflictException);
    });

    it('maps error when resolving create/update race replace fails', async () => {
      const existingPolicy = makePolicy('alpha', PROVIDER_WS, [':root:orgs:old'], '5');
      (kcpK8s.getClusterCustomObject as jest.Mock)
        .mockResolvedValueOnce(makeExport('alpha')) // export check
        .mockRejectedValueOnce(makeApiException(404)) // policy not found
        .mockResolvedValueOnce(existingPolicy); // re-fetch after 409
      (kcpK8s.createClusterCustomObject as jest.Mock).mockRejectedValueOnce(makeApiException(409));
      (kcpK8s.replaceClusterCustomObject as jest.Mock).mockRejectedValueOnce(makeApiException(422));

      await expect(
        service.setApiExportPolicy('alpha', { clusterPath: PROVIDER_WS, allowRules: validRules }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('accepts multiple allow rules including all-orgs', async () => {
      (kcpK8s.getClusterCustomObject as jest.Mock)
        .mockResolvedValueOnce(makeExport('alpha'))
        .mockRejectedValueOnce(makeApiException(404));
      (kcpK8s.createClusterCustomObject as jest.Mock).mockResolvedValueOnce({});

      const rules = [
        { path: 'root:orgs:demo', includeDescendants: false },
        { path: 'root:orgs:demo', includeDescendants: true },
        { path: 'root:orgs', includeDescendants: true },
      ];
      await service.setApiExportPolicy('alpha', { clusterPath: PROVIDER_WS, allowRules: rules });

      const createdBody = (kcpK8s.createClusterCustomObject as jest.Mock).mock.calls[0][2];
      expect(createdBody.spec.allowPathExpressions).toEqual([
        ':root:orgs:demo',
        ':root:orgs:demo:*',
        ':root:orgs:*',
      ]);
    });
  });
});
