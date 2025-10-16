import { getDiscoveryEndpoint, getOrganization } from './domain.js';
import type { Request } from 'express';

describe('getOrganization', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    process.env.OIDC_CLIENT_ID_DEFAULT = 'default-client';
    process.env.BASE_DOMAINS_DEFAULT = 'example.com';
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const makeReq = (hostname: string): Request =>
    ({ hostname }) as unknown as Request;

  it('returns subdomain when hostname is not base domain', () => {
    const req = makeReq('team1.example.com');
    expect(getOrganization(req)).toBe('team1');
  });

  it('returns client id when hostname equals base domain', () => {
    const req = makeReq('example.com');
    expect(getOrganization(req)).toBe('default-client');
  });

  it('handles single-label hostname', () => {
    const req = makeReq('localhost');
    expect(getOrganization(req)).toBe('localhost');
  });

  it('handles multi-level subdomain', () => {
    const req = makeReq('alpha.beta.example.com');
    expect(getOrganization(req)).toBe('alpha');
  });

  it('reflects updated env values', () => {
    process.env.OIDC_CLIENT_ID_DEFAULT = 'another-client';
    process.env.BASE_DOMAINS_DEFAULT = 'corp.example.org';
    expect(getOrganization(makeReq('corp.example.org'))).toBe('another-client');
    expect(getOrganization(makeReq('dev.corp.example.org'))).toBe('dev');
  });
});

describe('getDiscoveryEndpoint', () => {
  const OLD_ENV = process.env;

  const makeReq = (hostname: string): Request =>
    ({ hostname }) as unknown as Request;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    process.env.OIDC_CLIENT_ID_DEFAULT = 'default-client';
    process.env.BASE_DOMAINS_DEFAULT = 'example.com';
    process.env.DISCOVERY_ENDPOINT =
      'https://idp.example.com/${org-name}/.well-known/openid-configuration';
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('replaces ${org-name} with subdomain org from hostname', () => {
    const req = makeReq('team1.example.com');
    expect(getDiscoveryEndpoint(req)).toBe(
      'https://idp.example.com/team1/.well-known/openid-configuration',
    );
  });

  it('replaces ${org-name} with default client id when hostname equals base domain', () => {
    const req = makeReq('example.com');
    expect(getDiscoveryEndpoint(req)).toBe(
      'https://idp.example.com/default-client/.well-known/openid-configuration',
    );
  });

  it('uses first label for multi-level subdomains', () => {
    const req = makeReq('alpha.beta.example.com');
    expect(getDiscoveryEndpoint(req)).toBe(
      'https://idp.example.com/alpha/.well-known/openid-configuration',
    );
  });

  it('returns undefined when DISCOVERY_ENDPOINT is not set', () => {
    delete process.env.DISCOVERY_ENDPOINT;
    const req = makeReq('team1.example.com');
    expect(getDiscoveryEndpoint(req)).toBeUndefined();
  });

  it('returns template unchanged if it does not contain the placeholder', () => {
    process.env.DISCOVERY_ENDPOINT = 'https://idp.example.com/fixed-path';
    const req = makeReq('team1.example.com');
    expect(getDiscoveryEndpoint(req)).toBe(
      'https://idp.example.com/fixed-path',
    );
  });

  it('reflects updated env and organization resolution', () => {
    process.env.BASE_DOMAINS_DEFAULT = 'corp.example.org';
    process.env.OIDC_CLIENT_ID_DEFAULT = 'corp-default';
    process.env.DISCOVERY_ENDPOINT = 'https://auth.corp/${org-name}/discovery';
    expect(getDiscoveryEndpoint(makeReq('corp.example.org'))).toBe(
      'https://auth.corp/corp-default/discovery',
    );
    expect(getDiscoveryEndpoint(makeReq('dev.corp.example.org'))).toBe(
      'https://auth.corp/dev/discovery',
    );
  });
});
