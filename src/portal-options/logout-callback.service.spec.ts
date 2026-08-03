import { PMLogoutService } from './logout-callback.service.js';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AUTH_CONFIG_INJECTION_TOKEN,
  AuthConfigService,
  CookiesService,
} from '@openmfp/portal-server-lib';
import { Request, Response } from 'express';
import { of, throwError } from 'rxjs';

describe('PMLogoutService', () => {
  let service: PMLogoutService;
  let httpService: HttpService;
  let authConfigService: AuthConfigService;
  let cookiesService: CookiesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PMLogoutService,
        {
          provide: HttpService,
          useValue: { post: jest.fn() },
        },
        {
          provide: AUTH_CONFIG_INJECTION_TOKEN,
          useValue: { getAuthConfig: jest.fn() },
        },
        {
          provide: CookiesService,
          useValue: { getAuthCookie: jest.fn() },
        },
        {
          provide: 'AUTH_CONFIG_INJECTION_TOKEN',
          useValue: {},
        },
      ],
    }).compile();

    service = module.get(PMLogoutService);
    httpService = module.get(HttpService);
    authConfigService = module.get(AUTH_CONFIG_INJECTION_TOKEN);
    cookiesService = module.get(CookiesService);
  });

  it('should call endSessionUrl with refresh token', async () => {
    const mockRequest = {} as Request;
    const mockResponse = {} as Response;

    (authConfigService.getAuthConfig as jest.Mock).mockResolvedValue({
      clientId: 'client-id',
      clientSecret: 'secret',
      endSessionUrl: 'https://keycloak/logout',
    });
    (cookiesService.getAuthCookie as jest.Mock).mockReturnValue(
      'refresh-token',
    );
    (httpService.post as jest.Mock).mockReturnValue(of({ data: {} }));

    await service.handleLogout(mockRequest, mockResponse);

    expect(httpService.post).toHaveBeenCalledWith(
      'https://keycloak/logout',
      expect.any(URLSearchParams),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        auth: { username: 'client-id', password: 'secret' },
      },
    );
  });

  it('should not send the client secret as a form parameter', async () => {
    const mockRequest = {} as Request;
    const mockResponse = {} as Response;

    (authConfigService.getAuthConfig as jest.Mock).mockResolvedValue({
      clientId: 'client-id',
      clientSecret: 'secret',
      endSessionUrl: 'https://keycloak/logout',
    });
    (cookiesService.getAuthCookie as jest.Mock).mockReturnValue(
      'refresh-token',
    );
    (httpService.post as jest.Mock).mockReturnValue(of({ data: {} }));

    await service.handleLogout(mockRequest, mockResponse);

    const body = (httpService.post as jest.Mock).mock
      .calls[0][1] as URLSearchParams;
    expect(body.get('refresh_token')).toBe('refresh-token');
    expect(body.get('client_secret')).toBeNull();
    expect(body.get('client_id')).toBeNull();
  });

  it('should return logoutWithIdToken URL when logout fails', async () => {
    const mockRequest = {
      query: {
        id_token_hint: 'idtoken',
        post_logout_redirect_uri: 'https://redirect.com',
      },
    } as unknown as Request;
    const mockResponse = {} as Response;

    (authConfigService.getAuthConfig as jest.Mock).mockResolvedValue({
      clientId: 'client-id',
      clientSecret: 'secret',
      endSessionUrl: 'https://keycloak/logout',
    });
    (cookiesService.getAuthCookie as jest.Mock).mockReturnValue(
      'refresh-token',
    );
    (httpService.post as jest.Mock).mockReturnValue(
      throwError(() => new Error('Network error')),
    );

    const result = await service.handleLogout(mockRequest, mockResponse);

    expect(result).toBe(
      'https://keycloak/logout?id_token_hint=idtoken&post_logout_redirect_uri=https%3A%2F%2Fredirect.com',
    );
  });

  it('logoutWithIdToken should return valid URL', () => {
    const request = {
      query: {
        id_token_hint: 'token123',
        post_logout_redirect_uri: 'https://example.com',
      },
    } as unknown as Request;
    const result = (service as any).logoutWithIdToken(
      request,
      'https://kc/logout',
      'client-id',
    );
    expect(result).toBe(
      'https://kc/logout?id_token_hint=token123&post_logout_redirect_uri=https%3A%2F%2Fexample.com',
    );
  });

  it('logoutWithIdToken should fall back to client_id when no id token is present', () => {
    const request = {
      query: { post_logout_redirect_uri: 'https://example.com' },
    } as unknown as Request;

    const result = (service as any).logoutWithIdToken(
      request,
      'https://kc/logout',
      'client-id',
    );

    expect(result).toBe(
      'https://kc/logout?client_id=client-id&post_logout_redirect_uri=https%3A%2F%2Fexample.com',
    );
    expect(result).not.toContain('id_token_hint');
  });

  it('logoutWithIdToken should omit an absent post logout redirect uri', () => {
    const request = { query: {} } as unknown as Request;

    const result = (service as any).logoutWithIdToken(
      request,
      'https://kc/logout',
      'client-id',
    );

    expect(result).toBe('https://kc/logout?client_id=client-id');
  });
});
