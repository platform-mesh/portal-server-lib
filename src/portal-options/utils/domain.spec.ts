import { getOrganization } from './domain.js';
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
