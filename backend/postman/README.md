# LotusQuant API documentation

## Swagger UI

- Local: `http://localhost:5000/api-docs`
- Test server: `https://test-backtest.lotusquant.co/api-docs`
- Raw OpenAPI JSON: `/api-docs.json`

Use **Authorize** with a Bearer token for web APIs. Worker protocol APIs use an
`X-API-Key`. The specification is generated from the actual Express routes, so
Swagger and Postman cover the same endpoints.

## Postman import

1. Import `LotusQuant-All-APIs.postman_collection.json` into Postman.
2. Import `LotusQuant-Test.postman_environment.json`.
3. Select environment **LotusQuant - Test Backtest**.
4. Fill `username` and `password` locally. Do not commit or send real credentials.
5. Run `POST /auth/login`. Its test script automatically stores `access_token`.

Web APIs inherit Bearer authentication from the collection. Worker protocol APIs use `X-API-Key: {{worker_api_key}}`.

Some requests contain example bodies only. Replace IDs and payload fields with data from the environment under test. Be careful with DELETE, sync, purge, cancel, retry and other state-changing endpoints.

## Regenerate

Run from the backend root:

```powershell
node src/scripts/generatePostmanCollection.js
```

The generator reads the actual route declarations in `src/routes` and creates
the Postman collection, Postman environment and OpenAPI specification.
Regenerate after adding, deleting or renaming an API route.
