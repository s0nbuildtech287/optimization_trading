const fs = require('fs');
const path = require('path');
const swaggerUi = require('swagger-ui-express');

const generatedSpecPath = path.resolve(
  __dirname,
  '..',
  '..',
  'postman',
  'LotusQuant-All-APIs.openapi.json'
);

function loadSwaggerSpec() {
  if (!fs.existsSync(generatedSpecPath)) {
    return {
      openapi: '3.0.3',
      info: { title: 'LotusQuant API Docs', version: '1.0.0' },
      paths: {},
    };
  }
  return JSON.parse(fs.readFileSync(generatedSpecPath, 'utf8'));
}

const setupSwagger = (app) => {
  const swaggerSpec = loadSwaggerSpec();
  app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  console.log(
    `[Swagger] Loaded ${Object.keys(swaggerSpec.paths || {}).length} API paths from ${generatedSpecPath}`
  );
};

module.exports = setupSwagger;
