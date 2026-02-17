N8N WORKFLOW MANAGEMENT

Your task: $ARGUMENTS

## n8n REST API (Required Method)

Use the n8n REST API via curl. The API key is stored in n8n and must be included in requests.

**API Base:** `https://n8n.awake.am/api/v1`
**Auth Header:** `X-N8N-API-KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMWYxM2IzOS1lYmY4LTQ2MDYtYmFkMy1hZmUyN2IzNmYyNTQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzY2MzM2NTA2fQ.cwxBH3C9PRhjGcc16bEtzLZYLs9y8D7J7iWLPjyPOPQ`

### List Workflows
```bash
curl -s 'https://n8n.awake.am/api/v1/workflows' \
  -H 'X-N8N-API-KEY: <key>' | jq '.data[] | {id, name, active}'
```

### Get Workflow Details
```bash
curl -s 'https://n8n.awake.am/api/v1/workflows/<id>' \
  -H 'X-N8N-API-KEY: <key>' | jq .
```

### Create Workflow
```bash
curl -s -X POST 'https://n8n.awake.am/api/v1/workflows' \
  -H 'X-N8N-API-KEY: <key>' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Workflow Name",
    "nodes": [...],
    "connections": {...},
    "settings": {"executionOrder": "v1"}
  }'
```

### Activate Workflow
```bash
curl -s -X POST 'https://n8n.awake.am/api/v1/workflows/<id>/activate' \
  -H 'X-N8N-API-KEY: <key>'
```

### Deactivate Workflow
```bash
curl -s -X POST 'https://n8n.awake.am/api/v1/workflows/<id>/deactivate' \
  -H 'X-N8N-API-KEY: <key>'
```

### Delete Workflow
```bash
curl -s -X DELETE 'https://n8n.awake.am/api/v1/workflows/<id>' \
  -H 'X-N8N-API-KEY: <key>'
```

## IMPORTANT: Do NOT Use CLI Import

**Never use `n8n import:workflow` via SSH.** It creates workflows without `workflow_history` entries, which breaks activation. Always use the REST API.

The SSH method is only useful for:
- Exporting workflows: `ssh <host> "n8n export:workflow --id=<id>"`
- Listing workflows: `ssh <host> "n8n list:workflow"`

## Workflow JSON Structure

Minimal workflow structure for the API:
```json
{
  "name": "Workflow Name",
  "nodes": [
    {
      "name": "Node Name",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [0, 0],
      "parameters": {...}
    }
  ],
  "connections": {
    "Node Name": {
      "main": [[{"node": "Next Node", "type": "main", "index": 0}]]
    }
  },
  "settings": {"executionOrder": "v1"}
}
```

For Postgres nodes, include credentials:
```json
{
  "credentials": {
    "postgres": {"id": "LB8We3gQAiu4hoP8", "name": "Postgres account"}
  }
}
```

## Webhook Authentication Pattern

All webhook workflows need Header Auth. Use the existing credential:
- **Credential ID:** `EpVJBxGAWN9YI4q8`
- **Credential Name:** `Header Auth account`

Webhook node config:
```json
{
  "authentication": "headerAuth",
  "options": {}
}
```

## After Changes

- Save workflow JSON to `awake_n8n/workflows/` for version control
- Update `docs/workflows.md` if prompts or logic changed
- Test the endpoint with curl
