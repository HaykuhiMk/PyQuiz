// /api-docs must document every real HTTP endpoint, and nothing that doesn't
// exist. The route list is derived from the live Express app (walking the
// router stacks), not hard-coded, so adding a route without an @openapi
// block (or removing one and leaving its docs behind) fails this test.
process.env.SKIP_DB_CONNECT = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const request = require('supertest');
const app = require('../app');
const { spec } = require('../docs/swagger');

// Top-level routes deliberately left out of the spec (see docs/swagger.js).
const UNDOCUMENTED_TOP_LEVEL = new Set([
  'GET /',
  'GET /password_reset_link_success.html',
]);

const HTTP_METHODS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
  'trace',
];

// Turns an Express 4 mount regexp such as /^\/api\/v1\/auth\/?(?=\/|$)/i
// back into '/api/v1/auth'. Only static mount paths are supported; anything
// else throws so the test can't silently skip a router.
function mountPathFromRegexp(regexp) {
  const source = regexp.source.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '');
  const unescaped = source.replace(/\\\//g, '/');
  if (/[\\^$()[\]?*+|{}]/.test(unescaped)) {
    throw new Error(`Unsupported router mount pattern: ${regexp}`);
  }
  return unescaped;
}

function toOpenApiPath(expressPath) {
  const converted = expressPath.replace(/:(\w+)/g, '{$1}');
  return converted.length > 1 ? converted.replace(/\/$/, '') : converted;
}

function routesFromStack(stack, prefix) {
  const routes = [];
  for (const layer of stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        routes.push(
          `${method.toUpperCase()} ${toOpenApiPath(prefix + layer.route.path)}`
        );
      }
    } else if (layer.name === 'router' && layer.handle.stack) {
      routes.push(
        ...routesFromStack(layer.handle.stack, prefix + mountPathFromRegexp(layer.regexp))
      );
    }
  }
  return routes;
}

function actualRoutes() {
  return routesFromStack(app._router.stack, '').filter(
    (route) => !UNDOCUMENTED_TOP_LEVEL.has(route)
  );
}

function specRoutes() {
  const defaultServer = spec.servers[0].url;
  const routes = [];
  for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
    const server = (pathItem.servers && pathItem.servers[0].url) || defaultServer;
    const fullPath = toOpenApiPath(`${server.replace(/\/$/, '')}${pathKey}`);
    for (const method of HTTP_METHODS) {
      if (pathItem[method]) routes.push(`${method.toUpperCase()} ${fullPath}`);
    }
  }
  return routes;
}

function resolveRef(ref) {
  if (!ref.startsWith('#/')) throw new Error(`External $ref not supported: ${ref}`);
  return ref
    .slice(2)
    .split('/')
    .reduce((node, key) => (node === undefined ? undefined : node[key]), spec);
}

function collectRefs(node, found = []) {
  if (Array.isArray(node)) {
    node.forEach((item) => collectRefs(item, found));
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') found.push(value);
      else collectRefs(value, found);
    }
  }
  return found;
}

function operations() {
  const ops = [];
  for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
    for (const method of HTTP_METHODS) {
      if (pathItem[method]) ops.push({ pathKey, method, pathItem, op: pathItem[method] });
    }
  }
  return ops;
}

describe('OpenAPI spec coverage', () => {
  it('finds the v1 routers in the app (sanity check for the stack walk)', () => {
    const routes = actualRoutes();
    for (const prefix of [
      'auth',
      'users',
      'questions',
      'challenges',
      'admin',
      'contact',
      'quiz',
    ]) {
      expect(routes.some((route) => route.includes(` /api/v1/${prefix}`))).toBe(true);
    }
    expect(routes).toContain('GET /metrics');
  });

  it('documents every real endpoint', () => {
    const documented = new Set(specRoutes());
    const missing = actualRoutes().filter((route) => !documented.has(route));
    expect(missing).toEqual([]);
  });

  it('documents no endpoint that does not exist', () => {
    const real = new Set(actualRoutes());
    const extra = specRoutes().filter((route) => !real.has(route));
    expect(extra).toEqual([]);
  });
});

describe('OpenAPI spec validity', () => {
  it('is an OpenAPI 3 document', () => {
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBeTruthy();
    expect(spec.info.version).toBeTruthy();
  });

  it('resolves every $ref', () => {
    const unresolved = collectRefs(spec).filter((ref) => resolveRef(ref) === undefined);
    expect(unresolved).toEqual([]);
  });

  it('declares exactly the path parameters each path template uses', () => {
    const problems = [];
    for (const { pathKey, method, pathItem, op } of operations()) {
      const templated = [...pathKey.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      const declared = [...(pathItem.parameters || []), ...(op.parameters || [])]
        .map((param) => (param.$ref ? resolveRef(param.$ref) : param))
        .filter((param) => param.in === 'path');
      const names = declared.map((param) => param.name).sort();
      if (JSON.stringify(names) !== JSON.stringify(templated)) {
        problems.push(
          `${method.toUpperCase()} ${pathKey}: template ${templated} vs declared ${names}`
        );
      }
      if (declared.some((param) => param.required !== true)) {
        problems.push(
          `${method.toUpperCase()} ${pathKey}: path parameter not marked required`
        );
      }
    }
    expect(problems).toEqual([]);
  });

  it('gives every operation a unique operationId, a tag, a summary and responses', () => {
    const ids = operations().map(({ op }) => op.operationId);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { op } of operations()) {
      expect(op.tags && op.tags.length).toBeTruthy();
      expect(op.summary).toBeTruthy();
      expect(Object.keys(op.responses || {}).length).toBeGreaterThan(0);
    }
  });

  it('only references defined security schemes', () => {
    const defined = new Set(Object.keys(spec.components.securitySchemes));
    const used = operations().flatMap(({ op }) =>
      (op.security || []).flatMap((req) => Object.keys(req))
    );
    expect(used.filter((name) => !defined.has(name))).toEqual([]);
  });
});

describe('/api-docs outside production', () => {
  it('serves Swagger UI', async () => {
    const response = await request(app).get('/api-docs/');
    expect(response.statusCode).toBe(200);
  });
});
