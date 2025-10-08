import { PMAuthConfigProvider } from './auth-config-provider.js';
import { HttpException } from '@nestjs/common';
import {
  DiscoveryService,
  EnvAuthConfigService,
} from '@openmfp/portal-server-lib';
import type { Request } from 'express';
import { mock } from 'jest-mock-extended';

jest.mock('@kubernetes/client-node', () => {
  class KubeConfig {
    loadFromDefault = jest.fn();
    loadFromFile = jest.fn();
    getCurrentCluster = jest.fn().mockReturnValue({
      server: 'https://k8s.example.com/base',
      name: 'test-cluster',
    });
    makeApiClient = jest.fn();
    addUser = jest.fn();
    addContext = jest.fn();
    setCurrentContext = jest.fn();
  }
  class CustomObjectsApi {}
  return { KubeConfig, CustomObjectsApi };
});

describe('PMAuthConfigProvider', () => {
  let provider: PMAuthConfigProvider;
  let discoveryService: jest.Mocked<DiscoveryService>;
  let envAuthConfigService: jest.Mocked<EnvAuthConfigService>;

  beforeEach(() => {
    discoveryService = mock<DiscoveryService>();
    envAuthConfigService = mock<EnvAuthConfigService>();
    provider = new PMAuthConfigProvider(discoveryService);
    jest.resetModules();
    process.env = {
      AUTH_SERVER_URL_DEFAULT: 'authUrl',
      TOKEN_URL_DEFAULT: 'tokenUrl',
      BASE_DOMAINS_DEFAULT: 'example.com',
      OIDC_CLIENT_ID_DEFAULT: 'client123',
      OIDC_CLIENT_SECRET_DEFAULT: 'secret123',
    };
    provider['getClientSecret'] = jest.fn().mockResolvedValue('secret');
  });

  it('should delegate to EnvAuthConfigService if available', async () => {
    const req = { hostname: 'foo.example.com' } as Request;
    const expected = {
      idpName: 'idp',
      baseDomain: 'example.com',
      oauthServerUrl: 'url',
      oauthTokenUrl: 'token',
      clientId: 'cid',
      clientSecret: 'secret',
    };
    envAuthConfigService.getAuthConfig.mockResolvedValue(expected);

    const result = await provider.getAuthConfig(req);

    expect(result).toEqual({
      baseDomain: 'example.com',
      clientId: 'foo',
      clientSecret: 'secret',
      idpName: 'foo',
      oauthServerUrl: 'authUrl',
      oauthTokenUrl: 'tokenUrl',
    });
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
      clientId: 'foo',
      clientSecret: 'secret',
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
    const result = provider.getDomainAndOrganization(req);
    expect(result).toEqual({
      organization: 'foo',
      baseDomain: 'example.com',
    });
  });

  it('getDomain should return clientId if hostname equals baseDomain', () => {
    const req = { hostname: 'example.com' } as Request;
    const result = provider.getDomainAndOrganization(req);
    expect(result).toEqual({
      organization: 'client123',
      baseDomain: 'example.com',
    });
  });
});
