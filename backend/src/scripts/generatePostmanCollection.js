const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT_DIR = path.join(ROOT, 'postman');

const ROUTE_GROUPS = [
  { file: 'authRoute.js', prefix: '', name: 'Authentication' },
  { file: 'opRoute.js', prefix: '/api', name: 'Backtest Tables & Orders' },
  { file: 'strategyRoutes.js', prefix: '/api/strategies', name: 'Strategies' },
  { file: 'dashboardRoute.js', prefix: '/api', name: 'Dashboard Overview' },
  { file: 'riskAnalysisRoute.js', prefix: '/api', name: 'Dashboard - Risk Analysis' },
  { file: 'behaviorAnalysisRoute.js', prefix: '/api', name: 'Dashboard - Behavior Analysis' },
  { file: 'comparativeRankingRoute.js', prefix: '/api', name: 'Dashboard - Comparative Ranking' },
  { file: 'aiAnalysisRoute.js', prefix: '/api', name: 'Dashboard - AI Analysis' },
  { file: 'lotThresholdRoute.js', prefix: '/api/lot-threshold', name: 'Volume Optimization' },
  { file: 'marketRoute.js', prefix: '/api', name: 'Market Watch' },
  { file: 'chatRoute.js', prefix: '/api', name: 'AI Chat' },
  { file: 'userRoute.js', prefix: '/api', name: 'Users & Accounts' },
  { file: 'systemLogRoute.js', prefix: '/api', name: 'System & Activity Logs' },
  { file: 'notificationRoute.js', prefix: '/api', name: 'Notifications' },
  { file: 'mt5OptimizationRoute.js', prefix: '/api/mt5-optimization', name: 'MT5 Optimization - Web' },
  { file: 'mt5WorkerRoute.js', prefix: '', name: 'MT5 Worker Protocol', worker: true },
];

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const BODY_EXAMPLES = {
  'POST /auth/login': { username: '{{username}}', password: '{{password}}' },
  'POST /auth/request-otp': { username: '{{username}}', email: '{{email}}', password: '{{password}}' },
  'POST /auth/register': { username: '{{username}}', email: '{{email}}', password: '{{password}}', otp: '{{otp}}' },
  'POST /api/sync-sheet': { tableName: '{{backtest_table}}', driveFolderUrl: '{{drive_folder_url}}', runType: 'NEW_RUN' },
  'POST /api/sync-sheet-async': { tableName: '{{backtest_table}}', driveFolderUrl: '{{drive_folder_url}}', runType: 'NEW_RUN' },
  'POST /api/drive-summary-async': { driveFolderUrl: '{{drive_folder_url}}' },
  'POST /api/backtest-tables': { tableName: '{{backtest_table}}' },
  'PATCH /api/data-sources/:sourceName/owner': { ownerUserId: '{{user_id}}' },
  'POST /api/dashboard/remarks': { tableName: '{{backtest_table}}', strategyId: '{{strategy_id}}', remarks: 'QA test remark' },
  'POST /api/lot-threshold/run': { name: 'Postman Volume OP', sourceTables: ['{{backtest_table}}'] },
  'PUT /api/lot-threshold/selection': { analysisRunId: '{{analysis_run_id}}', strategyId: '{{strategy_id}}', sourceTable: '{{backtest_table}}', lotThreshold: 1 },
  'POST /api/lot-threshold/selection/reset': { analysisRunId: '{{analysis_run_id}}', strategyId: '{{strategy_id}}', sourceTable: '{{backtest_table}}' },
  'POST /api/chat/send': { message: 'Hello', model: '' },
  'PATCH /api/notifications/preferences': { enabled: true },
  'POST /api/mt5-optimization/sessions': { name: 'Postman Test Session', description: 'Created by QA' },
  'PATCH /api/mt5-optimization/sessions/:id': { name: 'Updated Session' },
  'POST /api/mt5-optimization/jobs': { session_id: '{{session_id}}', jobs: [] },
  'POST /api/mt5-optimization/jobs/every-tick': { session_id: '{{session_id}}', result_ids: [] },
  'PATCH /api/mt5-optimization/results/:id/watchlist': { selected: true },
  'PATCH /api/mt5-optimization/results/:id/backtest-candidate': { selected: true },
  'POST /api/mt5-optimization/backtest-candidates/auto-review': { session_id: '{{session_id}}' },
  'PATCH /api/mt5-optimization/backtest-candidates/:id/staging': { selected: true },
  'POST /api/v1/apikeys/verify': { api_key: '{{worker_api_key}}' },
  'POST /jobs/claim': { worker_name: '{{worker_name}}' },
  'POST /jobs/statuses': { job_ids: [] },
  'POST /jobs/heartbeat': { job_id: '{{job_id}}', worker_name: '{{worker_name}}', progress: 0 },
  'POST /jobs/done': { job_id: '{{job_id}}', worker_name: '{{worker_name}}' },
  'POST /jobs/fail': { job_id: '{{job_id}}', worker_name: '{{worker_name}}', error: 'QA test error' },
  'POST /workers/heartbeat': { worker_name: '{{worker_name}}', status: 'active' },
};

const PUBLIC_ENDPOINTS = new Set([
  'POST /auth/login',
  'POST /auth/register',
  'POST /auth/request-otp',
  'GET /api/market/prices',
  'GET /api/market/news/:symbol',
  'GET /api/market/candles/:symbol',
  'GET /api/mt5-queue/health',
]);

function stripCommentOnlyLines(source) {
  let inBlock = false;
  return source.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.includes('*/')) inBlock = false;
      return '';
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlock = true;
      return '';
    }
    if (trimmed.startsWith('//')) return '';
    return line;
  }).join('\n');
}

function extractRoutes(filePath) {
  const source = stripCommentOnlyLines(fs.readFileSync(filePath, 'utf8'));
  const found = [];
  const directPattern = /router\.(get|post|put|patch|delete)\(\s*(['"])([^'"]+)\2/g;
  let match;
  while ((match = directPattern.exec(source))) {
    found.push({ method: match[1].toUpperCase(), routePath: match[3], index: match.index });
  }

  const chainPattern = /router\.route\(\s*(['"])([^'"]+)\1\s*\)([^;]+);/g;
  while ((match = chainPattern.exec(source))) {
    const chain = match[3];
    for (const method of METHODS) {
      if (new RegExp(`\\.${method}\\s*\\(`).test(chain)) {
        found.push({ method: method.toUpperCase(), routePath: match[2], index: match.index });
      }
    }
  }
  return found.sort((a, b) => a.index - b.index || a.method.localeCompare(b.method));
}

function joinUrlPath(prefix, routePath) {
  const joined = `${prefix}/${routePath}`.replace(/\/{2,}/g, '/');
  return joined === '/' ? '/' : joined.replace(/\/$/, '');
}

function authFor(endpointKey, group) {
  if (PUBLIC_ENDPOINTS.has(endpointKey)) return { type: 'noauth' };
  if (group.worker) {
    return {
      type: 'apikey',
      apikey: [
        { key: 'key', value: 'X-API-Key', type: 'string' },
        { key: 'value', value: '{{worker_api_key}}', type: 'string' },
        { key: 'in', value: 'header', type: 'string' },
      ],
    };
  }
  return undefined;
}

function requestBody(endpointKey, method) {
  if (!['POST', 'PUT', 'PATCH'].includes(method)) return undefined;
  if (endpointKey === 'POST /api/check-files') {
    return {
      mode: 'formdata',
      formdata: [
        { key: 'files', type: 'file', src: [], description: 'Select one or more files' },
        { key: 'driveUrl', type: 'text', value: '{{drive_folder_url}}', disabled: true },
      ],
    };
  }
  if (endpointKey.includes('/artifacts/upload')) {
    return { mode: 'file', file: { src: '' } };
  }
  const example = BODY_EXAMPLES[endpointKey] || {};
  return {
    mode: 'raw',
    raw: JSON.stringify(example, null, 2),
    options: { raw: { language: 'json' } },
  };
}

function loginTests(endpointKey) {
  if (endpointKey !== 'POST /auth/login') return undefined;
  return [{
    listen: 'test',
    script: {
      type: 'text/javascript',
      exec: [
        'if (pm.response.code >= 200 && pm.response.code < 300) {',
        '  const json = pm.response.json();',
        '  const token = json.accessToken || json.token || json.data?.accessToken || json.data?.token;',
        '  if (token) pm.environment.set("access_token", token);',
        '}',
      ],
    },
  }];
}

function buildItem(group, route) {
  const fullPath = joinUrlPath(group.prefix, route.routePath);
  const endpointKey = `${route.method} ${fullPath}`;
  const request = {
    method: route.method,
    header: [{ key: 'Accept', value: 'application/json', type: 'text' }],
    url: `{{base_url}}${fullPath}`,
    description: `Actual Express route: ${endpointKey}`,
  };
  const auth = authFor(endpointKey, group);
  if (auth) request.auth = auth;
  const body = requestBody(endpointKey, route.method);
  if (body) {
    request.body = body;
    if (body.mode === 'raw') request.header.push({ key: 'Content-Type', value: 'application/json', type: 'text' });
  }
  const item = { name: endpointKey, request, response: [] };
  const event = loginTests(endpointKey);
  if (event) item.event = event;
  return item;
}

function buildCollection() {
  const folders = ROUTE_GROUPS.map((group) => {
    const filePath = path.join(ROOT, 'src', 'routes', group.file);
    const routes = extractRoutes(filePath);
    return {
      name: group.name,
      description: `Generated from src/routes/${group.file}`,
      item: routes.map((route) => buildItem(group, route)),
    };
  });
  const endpointCount = folders.reduce((sum, folder) => sum + folder.item.length, 0);
  return {
    info: {
      _postman_id: '4dbaf935-cb2c-45b0-9677-b5f9358e3301',
      name: `LotusQuant All APIs (${endpointCount} routes)`,
      description: 'Generated from the actual Express route files. Login first to populate access_token automatically. Destructive endpoints are included but are never executed automatically.',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: {
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{access_token}}', type: 'string' }],
    },
    event: [],
    variable: [],
    item: folders,
  };
}

function toOpenApiPath(routePath) {
  return routePath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function buildOpenApiRequestBody(endpointKey, method) {
  if (!['POST', 'PUT', 'PATCH'].includes(method)) return undefined;
  if (endpointKey === 'POST /api/check-files') {
    return {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: {
              files: { type: 'array', items: { type: 'string', format: 'binary' } },
              driveUrl: { type: 'string' },
            },
          },
        },
      },
    };
  }
  if (endpointKey.includes('/artifacts/upload')) {
    return {
      required: true,
      content: {
        'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
      },
    };
  }
  return {
    required: false,
    content: {
      'application/json': {
        schema: { type: 'object', additionalProperties: true },
        example: BODY_EXAMPLES[endpointKey] || {},
      },
    },
  };
}

function buildOpenApiSpec() {
  const paths = {};
  for (const group of ROUTE_GROUPS) {
    const filePath = path.join(ROOT, 'src', 'routes', group.file);
    for (const route of extractRoutes(filePath)) {
      const fullPath = joinUrlPath(group.prefix, route.routePath);
      const endpointKey = `${route.method} ${fullPath}`;
      const specPath = toOpenApiPath(fullPath);
      const pathParameters = [...fullPath.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => ({
        name: match[1],
        in: 'path',
        required: true,
        schema: { type: 'string' },
      }));
      const operationId = `${route.method.toLowerCase()}_${group.file.replace(/Route\.js$/, '')}_${fullPath}`
        .replace(/[^A-Za-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
      const operation = {
        tags: [group.name],
        summary: endpointKey,
        description: `Generated from src/routes/${group.file}`,
        operationId,
        responses: {
          200: { description: 'Successful response' },
          400: { description: 'Invalid request' },
          401: { description: 'Authentication required' },
          403: { description: 'Forbidden' },
          500: { description: 'Server error' },
        },
      };
      if (pathParameters.length) operation.parameters = pathParameters;
      const requestBodySpec = buildOpenApiRequestBody(endpointKey, route.method);
      if (requestBodySpec) operation.requestBody = requestBodySpec;
      operation.security = PUBLIC_ENDPOINTS.has(endpointKey)
        ? []
        : [{ [group.worker ? 'workerApiKey' : 'bearerAuth']: [] }];
      paths[specPath] ||= {};
      paths[specPath][route.method.toLowerCase()] = operation;
    }
  }
  return {
    openapi: '3.0.3',
    info: {
      title: 'LotusQuant API Docs',
      version: '1.0.0',
      description: 'Generated from the actual Express route declarations. Authenticate before using protected endpoints.',
    },
    servers: [
      { url: 'http://localhost:5000', description: 'Local backend' },
      { url: 'https://test-backtest.lotusquant.co', description: 'Test environment' },
    ],
    tags: ROUTE_GROUPS.map((group) => ({ name: group.name })),
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        workerApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
    },
    paths,
  };
}

function buildEnvironment() {
  const values = {
    base_url: 'https://test-backtest.lotusquant.co',
    username: '', password: '', email: '', otp: '', access_token: '', worker_api_key: '',
    worker_name: 'QA Worker', user_id: '1', backtest_table: 'backtest_123', strategy_id: '001BTCUSDH1OB',
    drive_folder_url: '', session_id: '', job_id: '', result_id: '', candidate_id: '', analysis_run_id: '',
    sync_id: '', sourceName: 'backtest_123', symbol: 'BTCUSD', sheetId: '', id: '1', tableName: 'backtest_123',
  };
  return {
    id: '4201c988-d387-497a-86fb-3f9f96c5dfb3',
    name: 'LotusQuant - Test Backtest',
    values: Object.entries(values).map(([key, value]) => ({ key, value, enabled: true, type: 'default' })),
    _postman_variable_scope: 'environment',
    _postman_exported_at: new Date().toISOString(),
    _postman_exported_using: 'LotusQuant route generator',
  };
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const collectionPath = path.join(OUTPUT_DIR, 'LotusQuant-All-APIs.postman_collection.json');
const environmentPath = path.join(OUTPUT_DIR, 'LotusQuant-Test.postman_environment.json');
const openApiPath = path.join(OUTPUT_DIR, 'LotusQuant-All-APIs.openapi.json');
fs.writeFileSync(collectionPath, `${JSON.stringify(buildCollection(), null, 2)}\n`, 'utf8');
fs.writeFileSync(environmentPath, `${JSON.stringify(buildEnvironment(), null, 2)}\n`, 'utf8');
fs.writeFileSync(openApiPath, `${JSON.stringify(buildOpenApiSpec(), null, 2)}\n`, 'utf8');

console.log(`Generated ${collectionPath}`);
console.log(`Generated ${environmentPath}`);
console.log(`Generated ${openApiPath}`);
