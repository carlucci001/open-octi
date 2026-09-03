# OpenOcti data model

OpenOcti stores logical JSON documents in the SQLite `kv_store` table. The row `filename` is the logical file name; its JSON payload has the collection shown below. JSON files are seed/import/export artifacts, not a second live database.

## accounts.json

- kv_store row: `filename='accounts.json'`
- Collections: `accounts`
- Record fields: `createdAt`, `id`, `industry`, `name`, `notes`, `priority`, `sample`, `stage`, `tags`, `type`, `updatedAt`, `website`

## activities.json

- kv_store row: `filename='activities.json'`
- Collections: `activities`
- Record fields: `at`, `body`, `createdAt`, `id`, `linkedTo`, `sample`, `subject`, `type`, `updatedAt`

## agents.json

- kv_store row: `filename='agents.json'`
- Collections: configuration object
- Record fields: varies by configuration

## calendar-config.json

- kv_store row: `filename='calendar-config.json'`
- Collections: `calendars`
- Record fields: varies by configuration

## contacts.json

- kv_store row: `filename='contacts.json'`
- Collections: `contacts`
- Record fields: `accountId`, `createdAt`, `id`, `name`, `notes`, `phone`, `primary`, `sample`, `tags`, `title`, `updatedAt`

## _index.json

- kv_store row: `filename='_index.json'`
- Collections: `templates`
- Record fields: `category`, `description`, `file`, `id`, `name`, `placeholders`, `requiresSignature`

## documents.json

- kv_store row: `filename='documents.json'`
- Collections: `forms`, `formSubmissions`, `documents`
- Record fields: `content`, `createdAt`, `id`, `sample`, `status`, `title`, `type`, `updatedAt`

## domains.json

- kv_store row: `filename='domains.json'`
- Collections: `domains`
- Record fields: varies by configuration

## invoices.json

- kv_store row: `filename='invoices.json'`
- Collections: `invoices`
- Record fields: varies by configuration

## leads.json

- kv_store row: `filename='leads.json'`
- Collections: `leads`
- Record fields: `businessName`, `createdAt`, `id`, `name`, `notes`, `phone`, `sample`, `source`, `status`, `tags`, `updatedAt`

## openocti-calendar-samples.json

- kv_store row: `filename='openocti-calendar-samples.json'`
- Collections: `events`
- Record fields: `calendarColor`, `calendarName`, `description`, `durationMinutes`, `hour`, `id`, `relativeDay`, `sample`, `title`

## opportunities.json

- kv_store row: `filename='opportunities.json'`
- Collections: `opportunities`
- Record fields: `accountId`, `contactId`, `createdAt`, `expectedClose`, `id`, `name`, `notes`, `pipelineId`, `probability`, `sample`, `stageId`, `tags`, `updatedAt`, `value`

## orchestrations.json

- kv_store row: `filename='orchestrations.json'`
- Collections: `orchestrations`
- Record fields: `createdAt`, `description`, `enabled`, `id`, `inputs`, `lastRunAt`, `name`, `runCount`, `slug`, `steps`, `tags`, `updatedAt`, `whatThisFlowDoes`

## payments.json

- kv_store row: `filename='payments.json'`
- Collections: `payments`
- Record fields: varies by configuration

## pipelines.json

- kv_store row: `filename='pipelines.json'`
- Collections: `pipelines`
- Record fields: `color`, `createdAt`, `description`, `id`, `name`, `stages`, `updatedAt`

## projects.json

- kv_store row: `filename='projects.json'`
- Collections: `projects`
- Record fields: `accountId`, `createdAt`, `id`, `name`, `notes`, `priority`, `sample`, `status`, `tags`, `updatedAt`

## releases.json

- kv_store row: `filename='releases.json'`
- Collections: `releases`
- Record fields: varies by configuration

## sponsor-leads.json

- kv_store row: `filename='sponsor-leads.json'`
- Collections: configuration object
- Record fields: varies by configuration

## subscriptions.json

- kv_store row: `filename='subscriptions.json'`
- Collections: `subscriptions`
- Record fields: varies by configuration

## tasks.json

- kv_store row: `filename='tasks.json'`
- Collections: `tasks`
- Record fields: `createdAt`, `description`, `dueDate`, `id`, `linkedTo`, `priority`, `sample`, `status`, `tags`, `title`, `updatedAt`

## voice-agent-roster.json

- kv_store row: `filename='voice-agent-roster.json'`
- Collections: configuration object
- Record fields: varies by configuration

## voice-agent.json

- kv_store row: `filename='voice-agent.json'`
- Collections: configuration object
- Record fields: varies by configuration

