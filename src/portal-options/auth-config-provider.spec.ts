import { PMAuthConfigProvider } from './auth-config-provider.js';
import { HttpException } from '@nestjs/common';
import {
  DiscoveryService,
  EnvAuthConfigService,
} from '@openmfp/portal-server-lib';
import type { Request } from 'express';
import { mock } from 'jest-mock-extended';

describe('PMAuthConfigProvider', () => {
  let provider: PMAuthConfigProvider;
  let discoveryService: jest.Mocked<DiscoveryService>;
  let envAuthConfigService: jest.Mocked<EnvAuthConfigService>;

  beforeEach(() => {
    discoveryService = mock<DiscoveryService>();
    envAuthConfigService = mock<EnvAuthConfigService>();
    provider = new PMAuthConfigProvider(discoveryService, envAuthConfigService);
    jest.resetModules();
    process.env = {
      AUTH_SERVER_URL_DEFAULT: 'authUrl',
      TOKEN_URL_DEFAULT: 'tokenUrl',
      BASE_DOMAINS_DEFAULT: 'example.com',
      OIDC_CLIENT_ID_DEFAULT: 'client123',
      OIDC_CLIENT_SECRET_DEFAULT: 'secret123',
    };
  });

  it('should delegate to EnvAuthConfigService if available', async () => {
    const req = { hostname: 'foo.example.com' } as Request;
    const expected = {
      idpName: 'foo',
      baseDomain: 'example.com',
      oauthServerUrl: 'url',
      oauthTokenUrl: 'token',
      clientId: 'cid',
      clientSecret: 'sec',
    };
    envAuthConfigService.getAuthConfig.mockResolvedValue(expected);

    const result = await provider.getAuthConfig(req);

    expect(result).toEqual(expected);
  });

  it('should fall back to default configuration if EnvAuthConfigService throws', async () => {
    const req = { hostname: 'foo.example.com' } as Request;
    envAuthConfigService.getAuthConfig.mockRejectedValue(new Error('fail'));
    discoveryService.getOIDC.mockResolvedValue({
      authorization_endpoint: 'authUrl',
      token_endpoint: 'tokenUrl',
    });

    const result = await provider.getAuthConfig(req);

    expect(result).toMatchObject({
      baseDomain: 'example.com',
      oauthServerUrl: 'authUrl',
      oauthTokenUrl: 'tokenUrl',
      clientId: 'client123',
      clientSecret: 'secret123',
    });
  });

  it('should throw if default configuration incomplete', async () => {
    const req = { hostname: 'foo.example.com' } as Request;
    envAuthConfigService.getAuthConfig.mockRejectedValue(new Error('fail'));
    discoveryService.getOIDC.mockResolvedValue(null);
    process.env = {};

    await expect(provider.getAuthConfig(req)).rejects.toThrow(HttpException);
  });

  it('getDomain should return organization and baseDomain', () => {
    const req = { hostname: 'foo.example.com' } as Request;
    const result = provider.getDomain(req);
    expect(result).toEqual({
      organization: 'foo',
      baseDomain: 'example.com',
    });
  });

  it('getDomain should return clientId if hostname equals baseDomain', () => {
    const req = { hostname: 'example.com' } as Request;
    const result = provider.getDomain(req);
    expect(result).toEqual({
      organization: 'client123',
      baseDomain: 'example.com',
    });
  });
});
