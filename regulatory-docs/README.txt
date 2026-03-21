Regulatory Documents Directory
==============================

Place regulatory PDFs here organized by agency:

  regulatory-docs/
  ├── ICH/    — ICH guidelines (e.g., E6(R2), E6(R3), E8, E9, E10)
  ├── FDA/    — FDA guidance documents
  └── EMA/    — EMA guidance documents

To seed the chunks table, run:

  deno run --allow-net --allow-read --allow-env scripts/ingest-regulatory.ts \
    --org-id=<your-org-uuid> \
    --agency=ICH \
    --dir=./regulatory-docs/ICH

Required environment variables:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  OPENAI_API_KEY

Use --dry-run to process and count chunks without writing to the database.
