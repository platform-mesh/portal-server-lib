import { buildWorkspacePath } from './build-workspace-path.util.js';

describe('buildWorkspacePath', () => {
  it('returns the root when no segments are provided', () => {
    expect(buildWorkspacePath()).toBe('root:orgs');
  });

  it('returns the root for an empty segments array', () => {
    expect(buildWorkspacePath([])).toBe('root:orgs');
  });

  it('appends a single organization segment', () => {
    expect(buildWorkspacePath(['orgX'])).toBe('root:orgs:orgX');
  });

  it('appends organization and account segments in order', () => {
    expect(buildWorkspacePath(['org', 'account'])).toBe(
      'root:orgs:org:account',
    );
  });

  it('skips a leading undefined organization and keeps the account', () => {
    expect(buildWorkspacePath([undefined, 'accY'])).toBe('root:orgs:accY');
  });

  it('skips a trailing undefined account and keeps the organization', () => {
    expect(buildWorkspacePath(['orgX', undefined])).toBe('root:orgs:orgX');
  });

  it('treats a composite path segment verbatim as one segment', () => {
    expect(buildWorkspacePath(['sub:a'])).toBe('root:orgs:sub:a');
  });

  it('appends a composite account path segment after the root', () => {
    expect(buildWorkspacePath(['acc1:acc2'])).toBe('root:orgs:acc1:acc2');
  });

  it('skips empty-string, null and undefined segments', () => {
    expect(buildWorkspacePath(['', null, undefined])).toBe('root:orgs');
    expect(buildWorkspacePath(['org', '', 'acc'])).toBe('root:orgs:org:acc');
  });

  describe('call-site parity', () => {
    it('matches kcp-k8s buildWorkspacePath([organization, account])', () => {
      expect(buildWorkspacePath(['org1', 'acc1'])).toBe('root:orgs:org1:acc1');
      expect(buildWorkspacePath(['org1', undefined])).toBe('root:orgs:org1');
      expect(buildWorkspacePath([undefined, undefined])).toBe('root:orgs');
    });

    it('matches authz-webhook buildWorkspacePath([organization, accountPath])', () => {
      // organization + composite accountPath → both joined
      expect(buildWorkspacePath(['org', 'acc1:acc2'])).toBe(
        'root:orgs:org:acc1:acc2',
      );
      // accountPath empty → only organization
      expect(buildWorkspacePath(['my-org', ''])).toBe('root:orgs:my-org');
    });
  });
});
