import { getDomainAndOrganization } from './domain.js';
import type { Request } from 'express';

describe('getDomainAndOrganization', () => {
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

  it('returns subdomain as organization when hostname is not base domain', () => {
    const req = makeReq('test-org.example.com');
    const result = getDomainAndOrganization(req);
    expect(result).toEqual({
      organization: 'test-org',
      baseDomain: 'example.com',
    });
  });

  it('returns client id as organization when hostname equals base domain', () => {
    const req = makeReq('example.com');
    const result = getDomainAndOrganization(req);
    expect(result).toEqual({
      organization: 'default-client',
      baseDomain: 'example.com',
    });
  });

  it('handles single-label hostnames', () => {
    const req = makeReq('localhost');
    const result = getDomainAndOrganization(req);
    expect(result).toEqual({
      organization: 'localhost',
      baseDomain: 'example.com',
    });
  });

  it('handles multi-level subdomains', () => {
    const req = makeReq('alpha.beta.example.com');
    const result = getDomainAndOrganization(req);
    expect(result).toEqual({
      organization: 'alpha',
      baseDomain: 'example.com',
    });
  });

  it('propagates updated env values', () => {
    process.env.OIDC_CLIENT_ID_DEFAULT = 'another-client';
    process.env.BASE_DOMAINS_DEFAULT = 'corp.example.org';
    const req1 = makeReq('corp.example.org');
    const req2 = makeReq('dev.corp.example.org');

    expect(getDomainAndOrganization(req1)).toEqual({
      organization: 'another-client',
      baseDomain: 'corp.example.org',
    });

    expect(getDomainAndOrganization(req2)).toEqual({
      organization: 'dev',
      baseDomain: 'corp.example.org',
    });
  });
});
