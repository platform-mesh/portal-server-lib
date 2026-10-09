import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HeaderParserService } from '@openmfp/portal-server-lib';
import { mock } from 'jest-mock-extended';
import { AuthzWebhookService } from '../permissions/adapters/authz-webhook.service.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';

function makeContext(request: object = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe('PlatformAdminGuard', () => {
  let guard: PlatformAdminGuard;
  let headerParser: jest.Mocked<HeaderParserService>;
  let authz: jest.Mocked<AuthzWebhookService>;

  beforeEach(async () => {
    headerParser = mock<HeaderParserService>();
    authz = mock<AuthzWebhookService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformAdminGuard,
        { provide: HeaderParserService, useValue: headerParser },
        { provide: AuthzWebhookService, useValue: authz },
      ],
    }).compile();

    guard = module.get(PlatformAdminGuard);
  });

  it('throws UnauthorizedException when no bearer token is present', async () => {
    headerParser.extractBearerToken.mockReturnValue(undefined);

    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('returns true when authz webhook is not configured (fail-open)', async () => {
    headerParser.extractBearerToken.mockReturnValue('my-token');
    authz.checkActionsForResource.mockResolvedValue(undefined);

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  it('throws ForbiddenException when the user lacks the owner permission', async () => {
    headerParser.extractBearerToken.mockReturnValue('my-token');
    authz.checkActionsForResource.mockResolvedValue([
      { resource: 'accounts', actions: ['get'] },
    ]);

    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns true when the user has the owner (delete) permission on accounts', async () => {
    headerParser.extractBearerToken.mockReturnValue('my-token');
    authz.checkActionsForResource.mockResolvedValue([
      { resource: 'accounts', actions: ['delete'] },
    ]);

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  it('passes the correct authz probe to the webhook service', async () => {
    headerParser.extractBearerToken.mockReturnValue('probe-token');
    authz.checkActionsForResource.mockResolvedValue(undefined);

    await guard.canActivate(makeContext());

    expect(authz.checkActionsForResource).toHaveBeenCalledWith({
      token: 'probe-token',
      organization: '',
      accountPath: '',
      checks: [
        {
          resource: 'accounts',
          group: 'core.platform-mesh.io',
          actions: ['delete'],
        },
      ],
    });
  });
});
