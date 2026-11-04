import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { mock } from 'jest-mock-extended';
import { HeaderParserService } from '@openmfp/portal-server-lib';
import { AuthzWebhookService } from '../permissions/adapters/authz-webhook.service.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';

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

function makeContext(authHeader?: string): ExecutionContext {
  const ctx = mock<ExecutionContext>();
  (ctx.switchToHttp as jest.Mock).mockReturnValue({
    getRequest: () => ({ headers: { authorization: authHeader } }),
  });
  return ctx;
}

describe('PlatformAdminGuard', () => {
  let guard: PlatformAdminGuard;
  const authzWebhook = mock<AuthzWebhookService>();
  const headerParser = mock<HeaderParserService>();

  beforeEach(() => {
    jest.resetAllMocks();
    guard = new PlatformAdminGuard(authzWebhook, headerParser);
  });

  it('throws UnauthorizedException when no token', async () => {
    (headerParser.extractBearerToken as jest.Mock).mockReturnValue(undefined);
    await expect(guard.canActivate(makeContext())).rejects.toThrow(UnauthorizedException);
  });

  it('throws ForbiddenException when authz check returns no permissions', async () => {
    (headerParser.extractBearerToken as jest.Mock).mockReturnValue('tok');
    (authzWebhook.checkActionsForInstance as jest.Mock).mockResolvedValue([]);
    await expect(guard.canActivate(makeContext('Bearer tok'))).rejects.toThrow(ForbiddenException);
  });

  it('propagates error when authz webhook unexpectedly throws (checkActionsForInstance cannot throw in practice)', async () => {
    (headerParser.extractBearerToken as jest.Mock).mockReturnValue('tok');
    (authzWebhook.checkActionsForInstance as jest.Mock).mockRejectedValue(new Error('network'));
    await expect(guard.canActivate(makeContext('Bearer tok'))).rejects.toThrow(Error);
  });

  it('returns true when delete on accounts is allowed', async () => {
    (headerParser.extractBearerToken as jest.Mock).mockReturnValue('tok');
    (authzWebhook.checkActionsForInstance as jest.Mock).mockResolvedValue([
      { resource: 'accounts', actions: ['delete'] },
    ]);
    await expect(guard.canActivate(makeContext('Bearer tok'))).resolves.toBe(true);
  });

  it('throws ForbiddenException when delete permission is absent from result', async () => {
    (headerParser.extractBearerToken as jest.Mock).mockReturnValue('tok');
    (authzWebhook.checkActionsForInstance as jest.Mock).mockResolvedValue([
      { resource: 'accounts', actions: ['get'] },
    ]);
    await expect(guard.canActivate(makeContext('Bearer tok'))).rejects.toThrow(ForbiddenException);
  });
});
