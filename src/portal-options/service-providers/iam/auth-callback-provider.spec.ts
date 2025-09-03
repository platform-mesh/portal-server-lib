import { AuthCallbackProvider } from './auth-callback-provider';
import { IAMGraphQlService } from './iam-graphql.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthTokenData } from '@openmfp/portal-server-lib';
import type { Request, Response } from 'express';
import { mock } from 'jest-mock-extended';

describe('AuthCallbackProvider', () => {
  let callback: AuthCallbackProvider;
  let iamServiceMock: IAMGraphQlService;

  beforeEach(async () => {
    iamServiceMock = mock<IAMGraphQlService>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthCallbackProvider,
        {
          provide: IAMGraphQlService,
          useValue: iamServiceMock,
        },
      ],
    }).compile();

    callback = module.get<AuthCallbackProvider>(AuthCallbackProvider);
  });

  it('should be defined', () => {
    expect(callback).toBeDefined();
  });

  it('should create a user', async () => {
    const req = mock<Request>();
    const res = mock<Response>();

    await callback.handleSuccess(req, res, {
      id_token: 'idtoken',
    } as AuthTokenData);

    expect(iamServiceMock.addUser).toHaveBeenCalledTimes(1);
    expect(iamServiceMock.addUser).toHaveBeenCalledWith('idtoken', req);
  });
});
