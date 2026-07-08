import { ContentConfiguration } from '@openmfp/portal-server-lib';
import { PermissionsProxyService } from './permissions-proxy.service.js';

function makeCC(nodes: ContentConfiguration['luigiConfigFragment']['data']['nodes'] = []): ContentConfiguration {
  return {
    name: 'test',
    creationTimestamp: '',
    luigiConfigFragment: { data: { nodes } },
  };
}

describe('PermissionsProxyService', () => {
  let service: PermissionsProxyService;

  beforeEach(() => {
    service = new PermissionsProxyService();
  });

  it('returns undefined when no checks are extracted', async () => {
    const result = await service.resolvePermissions('token', 'user-1', 'acc1', [makeCC()]);
    expect(result).toBeUndefined();
  });

  it('returns all requested actions as allowed (stub) and logs a warning', async () => {
    const cc = makeCC([
      { context: { resourceDefinition: { entity: 'pods', checkActions: ['get', 'list'] } } },
    ]);
    const logSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => {});

    const result = await service.resolvePermissions('mytoken', 'user-1', 'acc1', [cc]);

    expect(result).toEqual([{ resource: 'pods', actions: ['get', 'list'] }]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('no adapter configured'));
    logSpy.mockRestore();
  });

  it('expands "All" checkActions to default verbs', async () => {
    const cc = makeCC([
      { context: { resourceDefinition: { entity: 'accounts', checkActions: 'All' } } },
    ]);
    const logSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => {});

    const result = await service.resolvePermissions('mytoken', 'user-1', 'acc1', [cc]);

    expect(result).toEqual([
      { resource: 'accounts', actions: ['get', 'list', 'create', 'update', 'delete', 'watch'] },
    ]);
    logSpy.mockRestore();
  });

  it('includes userId and accountPath in warning message', async () => {
    const cc = makeCC([
      { context: { resourceDefinition: { entity: 'pods', checkActions: ['get'] } } },
    ]);
    const logSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => {});

    await service.resolvePermissions('mytoken', 'user-123', 'my-account', [cc]);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('user-123'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('my-account'));
    logSpy.mockRestore();
  });
});
