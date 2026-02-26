import { replaceStringDeep } from './replace-string-deep.js';

describe('replaceStringDeep', () => {
  it('replaces matching strings in nested objects and arrays', () => {
    const target = {
      direct: ':accountId',
      nested: {
        list: [':accountId', { deep: ':accountId' }],
      },
    };

    replaceStringDeep(target, ':accountId', ':accountId:2');

    expect(target).toEqual({
      direct: ':accountId:2',
      nested: {
        list: [':accountId:2', { deep: ':accountId:2' }],
      },
    });
  });

  it('does not replace partial string matches', () => {
    const target = {
      exact: ':accountId',
      partial: ':accountId:suffix',
    };

    replaceStringDeep(target, ':accountId', ':accountId:2');

    expect(target.exact).toBe(':accountId:2');
    expect(target.partial).toBe(':accountId:suffix');
  });

  it('supports root arrays', () => {
    const target = [':accountId', { value: ':accountId' }, ['other']];

    replaceStringDeep(target, ':accountId', ':accountId:2');

    expect(target).toEqual([':accountId:2', { value: ':accountId:2' }, ['other']]);
  });
});
