import { ContentConfiguration, LuigiNode } from '@openmfp/portal-server-lib';

const PORTAL_BUNDLE_PATH = '/assets/platform-mesh-portal-ui-wc.js';

function isPortalBundleUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  // These paths always resolve against the portal, including remote provider
  // configurations. Do not infer ownership from a provider's configuration URL.
  // Leave absolute URLs unchanged instead of inferring an origin from proxies.
  return (
    value === PORTAL_BUNDLE_PATH ||
    value.startsWith(`${PORTAL_BUNDLE_PATH}#`) ||
    value.startsWith(`${PORTAL_BUNDLE_PATH}?`)
  );
}

function normalizeNode(
  node: LuigiNode,
  defaults: LuigiNode | undefined,
): LuigiNode {
  if (!node || typeof node !== 'object') return node;

  // Match OpenMFP createNode's shallow default merge. Write the fallback onto
  // this node, never onto shared defaults that also apply to unrelated views.
  const effective = { ...defaults, ...node };
  const result = { ...node };
  const webcomponent = effective.webcomponent;
  if (
    webcomponent &&
    typeof webcomponent === 'object' &&
    webcomponent.selfRegistered === true &&
    webcomponent.type === undefined &&
    isPortalBundleUrl(effective.url ?? effective.viewUrl)
  ) {
    result.webcomponent = { ...webcomponent, type: 'module' };
  }

  if (Array.isArray(effective.children)) {
    result.children = effective.children.map((child) =>
      normalizeNode(child, defaults),
    );
  }
  if (Array.isArray(effective.compound?.children)) {
    result.compound = {
      ...effective.compound,
      // Compound children are already Luigi views: the server does not apply
      // the content configuration's nodeDefaults to them.
      children: effective.compound.children.map((child: LuigiNode) =>
        normalizeNode(child, undefined),
      ),
    };
  }

  return result;
}

export function normalizePortalWebComponentModules(
  contentConfiguration: ContentConfiguration,
): void {
  const data = contentConfiguration?.luigiConfigFragment?.data;
  if (!Array.isArray(data?.nodes)) return;

  // Runtime JSON can use Luigi node properties beyond LuigiNodeDefaults' type.
  const defaults = data.nodeDefaults as LuigiNode | undefined;
  data.nodes = data.nodes.map((node) => normalizeNode(node, defaults));
}
