-- Phase 1 / 5 of 5: action registry (spec §4.7). Reference data that every environment
-- needs, so it lives in a migration rather than seed.sql. Idempotent.

insert into public.actions (name, description, params_schema, requires_confirmation, n8n_path)
values
  (
    'order_status',
    'Look up the status of an order. Needs the order number and the email used for the order.',
    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["orderNumber", "email"],
      "properties": {
        "orderNumber": { "type": "string", "minLength": 1, "maxLength": 32 },
        "email": { "type": "string", "format": "email", "maxLength": 254 }
      }
    }',
    true,
    'relay-action-order-status'
  ),
  (
    'create_ticket',
    'Create a support ticket for the shop owner when the visitor needs follow-up.',
    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["subject", "description"],
      "properties": {
        "subject": { "type": "string", "minLength": 1, "maxLength": 200 },
        "description": { "type": "string", "maxLength": 4000 },
        "visitorEmail": { "type": "string", "format": "email", "maxLength": 254 }
      }
    }',
    true,
    'relay-action-create-ticket'
  )
on conflict (name) do update
  set description = excluded.description,
      params_schema = excluded.params_schema,
      requires_confirmation = excluded.requires_confirmation,
      n8n_path = excluded.n8n_path;
