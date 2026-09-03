import { COMMAND_CENTER_MENU_GUIDE } from '@/lib/commandCenterNavigation'

export const OPENAI_REALTIME_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'marin', 'sage', 'shimmer', 'verse']

// Gemini (Google) prebuilt TTS / Live voices and their character.
// Selectable per-agent in the voice editor; available for every agent.
export const GEMINI_VOICE_MODELS = ['gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts', 'gemini-live-2.5-flash-preview']
export const GEMINI_VOICES = [
  { id: 'Zephyr', style: 'Bright' },
  { id: 'Puck', style: 'Upbeat' },
  { id: 'Charon', style: 'Informative' },
  { id: 'Kore', style: 'Firm' },
  { id: 'Fenrir', style: 'Excitable' },
  { id: 'Leda', style: 'Youthful' },
  { id: 'Orus', style: 'Firm' },
  { id: 'Aoede', style: 'Breezy' },
  { id: 'Callirrhoe', style: 'Easy-going' },
  { id: 'Autonoe', style: 'Bright' },
  { id: 'Enceladus', style: 'Breathy' },
  { id: 'Iapetus', style: 'Clear' },
  { id: 'Umbriel', style: 'Easy-going' },
  { id: 'Algieba', style: 'Smooth' },
  { id: 'Despina', style: 'Smooth' },
  { id: 'Erinome', style: 'Clear' },
  { id: 'Algenib', style: 'Gravelly' },
  { id: 'Rasalgethi', style: 'Informative' },
  { id: 'Laomedeia', style: 'Upbeat' },
  { id: 'Achernar', style: 'Soft' },
  { id: 'Alnilam', style: 'Firm' },
  { id: 'Schedar', style: 'Even' },
  { id: 'Gacrux', style: 'Mature' },
  { id: 'Pulcherrima', style: 'Forward' },
  { id: 'Achird', style: 'Friendly' },
  { id: 'Zubenelgenubi', style: 'Casual' },
  { id: 'Vindemiatrix', style: 'Gentle' },
  { id: 'Sadachbia', style: 'Lively' },
  { id: 'Sadaltager', style: 'Knowledgeable' },
  { id: 'Sulafat', style: 'Warm' },
]

const emptyParams = {
  type: 'object',
  properties: {},
  additionalProperties: false,
}

export const OPENAI_REALTIME_TOOLS = [
  {
    type: 'function',
    name: 'end_session',
    description: 'End the active voice conversation naturally. Use this when Carl says he is done, goodbye, bye, have a good day, end the call, hang up, disconnect, stop listening, or anything similar.',
    parameters: emptyParams,
  },
  {
    type: 'function',
    name: 'end_call',
    description: 'Alias for end_session. End the active voice conversation naturally when Carl says goodbye, bye, I am done, end the call, hang up, or disconnect.',
    parameters: emptyParams,
  },
  {
    type: 'function',
    name: 'daily_briefing',
    description: "Summarize Carl's day, pipeline, tasks, meetings, revenue, and urgent items.",
    parameters: emptyParams,
  },
  {
    type: 'function',
    name: 'ops_status',
    description: 'Report live Command Center Ops status: CRM service, Gitea, repo branch/latest commit/dirty state, backup schedule, latest backup snapshot, and backup log. Use for Craig/admin questions about backups, production, deploys, CI/CD, repos, or Gitea.',
    parameters: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'Optional focus such as repo, backup, gitea, production, deploy, or ops.' },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'repository_status',
    description: 'Report live repository/Gitea status for Craig: branch, latest commit, dirty state, and whether the GitHub source-of-truth ref matches the scheduled Gitea backup mirror. Use when Carl asks about latest repos, source control, Git, Gitea, mirror lag, or commit status.',
    parameters: emptyParams,
  },
  {
    type: 'function',
    name: 'backup_status',
    description: 'Report live backup/restore status for Craig: database restore points plus the nightly GitHub-to-Gitea mirror schedule, last run, next run, and current ref comparison.',
    parameters: emptyParams,
  },
  {
    type: 'function',
    name: 'search_twilio_numbers',
    description: 'Search live Twilio inventory for available US local numbers. Use for Craig/Ops telecom setup when Carl asks for a client phone line, area code, or prefix preference. This is read-only and does not buy a number.',
    parameters: {
      type: 'object',
      properties: {
        areaCode: { type: 'string', description: 'Three-digit area code, such as 828.' },
        prefixes: { type: 'array', items: { type: 'string' }, description: 'Optional three-digit local prefixes, such as 400 or 707.' },
        prefix: { type: 'string', description: 'Optional single prefix or comma-separated prefixes.' },
        limit: { type: 'number', description: 'Maximum numbers to return.' },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'prepare_twilio_number_setup',
    description: 'Prepare a Twilio number setup plan for a client by searching live inventory and explaining the next approval step. This does not buy or assign a number.',
    parameters: {
      type: 'object',
      properties: {
        clientName: { type: 'string', description: 'Client, tenant, or account name.' },
        areaCode: { type: 'string', description: 'Three-digit area code, such as 828.' },
        prefixes: { type: 'array', items: { type: 'string' }, description: 'Optional three-digit local prefixes, such as 400 or 707.' },
        prefix: { type: 'string', description: 'Optional single prefix or comma-separated prefixes.' },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'whats_next',
    description: "Find Carl's next calendar event.",
    parameters: emptyParams,
  },
  {
    type: 'function',
    name: 'whats_overdue',
    description: "List overdue tasks or follow-ups in the CRM.",
    parameters: emptyParams,
  },
  {
    type: 'function',
    name: 'pipeline_status',
    description: 'Summarize open opportunities, pipeline value, and deal distribution.',
    parameters: emptyParams,
  },
  {
    type: 'function',
    name: 'account_summary',
    description: 'Look up and summarize an account, client, or business record.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name or search phrase for the account.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'create_account',
    description: 'Create a CRM account, log the creation, and open the new account on Carl\'s screen. Use when Maggie is asked to create, add, or open a new account/client/prospect/vendor. If the name is missing, ask once for the name before calling.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Account, client, prospect, partner, or vendor name.' },
        type: { type: 'string', description: 'Optional account type such as prospect, client, partner, or vendor. Defaults to prospect.' },
        stage: { type: 'string', description: 'Optional stage. Defaults to active.' },
        priority: { type: 'string', description: 'Optional priority such as low, medium, high, urgent, or vip. Defaults to medium.' },
        website: { type: 'string', description: 'Optional website.' },
        industry: { type: 'string', description: 'Optional industry.' },
        address: { type: 'string', description: 'Optional address.' },
        notes: { type: 'string', description: 'Optional starting note for the account.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional account tags.' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'outstanding_invoices',
    description: 'Find unpaid invoices, optionally narrowed to one client.',
    parameters: {
      type: 'object',
      properties: {
        clientQuery: { type: 'string', description: 'Optional client name or account search phrase.' },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'invoice_command',
    description: 'Create, draft, send, or email a CRM invoice/payment request using the deterministic CRM invoice route. Use this for invoice actions instead of free-form chat.',
    parameters: {
      type: 'object',
      properties: {
        request: { type: 'string', description: 'The full spoken invoice request, if available.' },
        clientName: { type: 'string', description: 'Client or account name to bill.' },
        amount: { type: 'number', description: 'Invoice amount in US dollars.' },
        description: { type: 'string', description: 'What the charge is for.' },
        send: { type: 'boolean', description: 'True when Carl asked to send or email the invoice now; false to leave it as a draft.' },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'create_task',
    description: 'Create a CRM task and optionally link it to a client or lead.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title.' },
        dueDate: { type: 'string', description: 'Optional ISO date, such as 2026-05-12.' },
        priority: { type: 'string', description: 'Optional priority such as low, medium, high, urgent.' },
        linkedToQuery: { type: 'string', description: 'Optional client, lead, project, or opportunity to link.' },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'complete_task',
    description: 'Mark one matching task complete.',
    parameters: {
      type: 'object',
      properties: {
        titleQuery: { type: 'string', description: 'Words from the task title.' },
      },
      required: ['titleQuery'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'log_activity',
    description: 'Write a CRM activity note linked to a matching record.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Activity type, usually note, call, email, meeting, or task.' },
        subject: { type: 'string', description: 'Short activity subject.' },
        body: { type: 'string', description: 'Activity details.' },
        linkedToQuery: { type: 'string', description: 'Client, lead, opportunity, project, or contact to link.' },
      },
      required: ['body'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'open_record',
    description: 'Open a CRM record on screen for Carl.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name or phrase to search.' },
        type: { type: 'string', description: 'Optional type: account, contact, lead, opportunity, project.' },
        subTab: { type: 'string', description: 'Optional section to open inside the record.' },
        itemQuery: { type: 'string', description: 'Optional child item to focus.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'fcc_open_record',
    description: 'Open a CRM record on screen for Carl. Alias for open_record used by FCC/OpenClaw-trained agents.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name or phrase to search.' },
        name: { type: 'string', description: 'Optional record name.' },
        clientName: { type: 'string', description: 'Optional client/account name.' },
        accountName: { type: 'string', description: 'Optional account name.' },
        type: { type: 'string', description: 'Optional type: account, contact, lead, opportunity, project.' },
        subTab: { type: 'string', description: 'Optional section to open inside the record.' },
        itemQuery: { type: 'string', description: 'Optional child item to focus.' },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'navigate_to',
    description: `Navigate to any Farrington Command Center section. Authoritative menu map:\n${COMMAND_CENTER_MENU_GUIDE}\nRepository is top-level. For repository/repo/Gitea/Git/source control/source code/code repository, use section "repository".`,
    parameters: {
      type: 'object',
      properties: {
        section: { type: 'string', description: 'CRM section name.' },
      },
      required: ['section'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'command_center_action',
    description: 'Invoke top command-center controls and toolbar actions, including the floating API spend meter. Use open_api_meter to expand it, close_api_meter when Carl says close so it collapses and returns him to work, hide_api_meter to unpin it, and open_api_spend_panel for the full Finance control panel. Also supports open AI/Maggie, switchboard, repository/Gitea, messages/feed, notifications, help, settings, transcription capture, network mode, sidebar/right rail, and Documents.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action id: open_ai, open_switchboard, open_repository, open_gitea, open_messages, open_notifications, open_help, open_settings, open_transcription, arm_transcription, start_transcription, open_api_meter, close_api_meter, hide_api_meter, open_api_spend_panel, create_document, list_documents, toggle_network_mode, toggle_sidebar, expand_sidebar, collapse_sidebar, toggle_right_rail, expand_right_rail, collapse_right_rail.' },
        target: { type: 'string', description: 'Optional natural target name. For arm_transcription, use this for the other speaker, client, prospect, lead, or account holder name.' },
        value: { type: 'string', description: 'Optional value such as solo, multi, open, closed.' },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'crm_capabilities',
    description: 'Discover the exact live CRM tool for an actionable request in any Command Center component, tab, lab, record, or form. Use this before improvising when the needed tool is not already obvious. The result includes real tool names, descriptions, and Args contracts. Then collect only genuinely missing required values and call crm_action.',
    parameters: {
      type: 'object',
      properties: {
        component: { type: 'string', description: 'Current or relevant CRM component, such as Press, Leads, Accounts, Contacts, Documents, Finance, Tasks, Projects, Products, Automations, Media, or Support.' },
        task: { type: 'string', description: 'What Carl wants completed, in his own words. Include the requested record type and output fields.' },
      },
      required: ['task'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'crm_action',
    description: 'Execute one exact live CRM tool returned by crm_capabilities. Put that tool name in toolName and its Args object as JSON in argsJson. Reuse known/current-screen values and ask one short question at a time for missing required Args. Never invent approval or confirmation values; wait for Carl to explicitly approve consequential actions when the tool requires it.',
    parameters: {
      type: 'object',
      properties: {
        toolName: { type: 'string', description: 'Exact tool name returned by crm_capabilities, for example list_press_contacts, create_contact, create_task, or save_document_to_account.' },
        argsJson: { type: 'string', description: 'A valid JSON object containing the selected tool Args, for example {\"topic\":\"technology\",\"limit\":10}. Use {} when there are no Args.' },
      },
      required: ['toolName'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'transfer_to_agent',
    description: 'Immediately transfer the active voice session to another named Farrington agent. Every active agent, including Maggie, can use this. Use this when Carl asks for Craig, Maggie, Frank, Sasha, Linda, Cameron, Mark, Doreen, Diane, or another teammate. Do not say you are checking availability.',
    parameters: {
      type: 'object',
      properties: {
        agentName: { type: 'string', description: 'Target agent name, such as Craig, Maggie, Frank, Sasha, Linda, Cameron, Mark, Doreen, or Diane.' },
        reason: { type: 'string', description: 'Optional concise handoff reason.' },
      },
      required: ['agentName'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'fcc_navigate_to',
    description: `Navigate to a Command Center section. Alias for navigate_to used by FCC/OpenClaw-trained agents. Authoritative menu map:\n${COMMAND_CENTER_MENU_GUIDE}`,
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'CRM section name.' },
        tabId: { type: 'string', description: 'CRM tab id.' },
        page: { type: 'string', description: 'CRM page name.' },
        section: { type: 'string', description: 'CRM section name.' },
        name: { type: 'string', description: 'CRM section name.' },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'send_email',
    description: 'Send an email when Carl explicitly asks for it.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Email address or client name.' },
        subject: { type: 'string', description: 'Email subject.' },
        body: { type: 'string', description: 'Email body.' },
      },
      required: ['to', 'subject', 'body'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'send_signature_document',
    description: 'Create a document from a template and email a secure e-signature link, usually for an NDA or contract.',
    parameters: {
      type: 'object',
      properties: {
        clientName: { type: 'string', description: 'Client, contact, or counterparty name.' },
        signerName: { type: 'string', description: 'Signer name if different from clientName.' },
        signerEmail: { type: 'string', description: 'Signer email if not already in the CRM.' },
        templateName: { type: 'string', description: 'Template name, such as standard NDA.' },
        purpose: { type: 'string', description: 'Purpose of the NDA or agreement.' },
      },
      required: ['clientName'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'create_content_draft',
    description: 'Create a durable Content Lab draft before turning it into an article, blog, meme, social post, email, script, image brief, video brief, or campaign package. Use this for Sasha and content agents when Carl asks to produce content from an idea, notes, client facts, or source material.',
    parameters: {
      type: 'object',
      properties: {
        workflow: { type: 'string', description: 'Workflow id: story, blog, social-post, meme, email, video-script, image-brief, or campaign-package.' },
        topic: { type: 'string', description: 'Main topic or assignment.' },
        title: { type: 'string', description: 'Optional draft title.' },
        audience: { type: 'string', description: 'Target audience, customer type, or platform.' },
        goal: { type: 'string', description: 'Business or editorial goal.' },
        tone: { type: 'string', description: 'Desired tone or voice.' },
        source: { type: 'string', description: 'Source notes, facts, transcript, offer details, or links to preserve in the draft.' },
        keywords: { type: 'string', description: 'Optional SEO or campaign keywords.' },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'generate_image',
    description: 'Generate an image and save it to the media library. If provider is blank, the server uses this agent\'s saved Image provider setting from Agent Manager; Sasha currently defaults to OpenAI/ChatGPT.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Image prompt.' },
        title: { type: 'string', description: 'Optional media title.' },
        folder: { type: 'string', description: 'Optional media folder.' },
        size: { type: 'string', description: 'Optional size: 1024x1024, 1024x1536, or 1536x1024.' },
        provider: { type: 'string', description: 'openai, auto, imagen, gemini, fal, openrouter, or pexels.' },
        approvedByCarl: { type: 'boolean', description: 'True when Carl directly asked for this image/social post.' },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'take_note_for_client',
    description: 'Save a note to a named client account.',
    parameters: {
      type: 'object',
      properties: {
        clientName: { type: 'string', description: 'Client or account name.' },
        note: { type: 'string', description: 'Note text.' },
        subject: { type: 'string', description: 'Optional note subject.' },
        agentName: { type: 'string', description: 'Optional agent name for the audit trail.' },
      },
      required: ['clientName', 'note'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'list_notes',
    description: 'List markdown notes in a configured Command Vault/project vault.',
    parameters: {
      type: 'object',
      properties: {
        vault: { type: 'string', description: 'Optional vault id or name, such as command-center, ContentHub, dark-design, wnct-template, or openclaw-workspace.' },
        folder: { type: 'string', description: 'Optional folder prefix.' },
        q: { type: 'string', description: 'Optional text to match in note paths.' },
        limit: { type: 'number', description: 'Optional maximum notes to return.' },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'search_notes',
    description: 'Search Command Vault markdown note titles and content. Use this before reading when Carl asks about stored knowledge and the exact path is unknown.',
    parameters: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search text.' },
        vault: { type: 'string', description: 'Optional vault id or name.' },
        folder: { type: 'string', description: 'Optional folder prefix.' },
        limit: { type: 'number', description: 'Optional maximum matches to return.' },
      },
      required: ['q'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'read_note',
    description: 'Read one markdown note from a configured Command Vault/project vault.',
    parameters: {
      type: 'object',
      properties: {
        vault: { type: 'string', description: 'Optional vault id or name.' },
        path: { type: 'string', description: 'Markdown note path inside the vault.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'write_note',
    description: 'Create or overwrite a markdown note in a configured Command Vault/project vault.',
    parameters: {
      type: 'object',
      properties: {
        vault: { type: 'string', description: 'Optional vault id or name.' },
        path: { type: 'string', description: 'Optional markdown note path inside the vault.' },
        title: { type: 'string', description: 'Optional note title when path is not supplied.' },
        folder: { type: 'string', description: 'Optional folder for title-based notes.' },
        content: { type: 'string', description: 'Full markdown content to save.' },
      },
      required: ['content'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'delegate_to_jules',
    description: "Send a well-scoped engineering, code review, or repository analysis task to Google's Jules async coding agent. Use this for background work, not instant answers.",
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The complete task Jules should perform, including expected output.' },
        repoName: { type: 'string', description: 'Optional GitHub repository/source name to target. Leave blank if unsure so the server can choose or ask.' },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'create_plugin_change_request',
    description: 'Safely capture an OpenClaw/plugin change request for engineering review. This creates a CRM task; it does not edit files, restart services, commit, deploy, or change OpenClaw config.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title for the requested OpenClaw/plugin change.' },
        scope: { type: 'string', description: 'Affected area, plugin, tool, or agent.' },
        target: { type: 'string', description: 'Specific plugin, tool, route, or system target if known.' },
        details: { type: 'string', description: 'Plain-language description of the request.' },
        likelyFiles: { type: 'array', items: { type: 'string' }, description: 'Likely repo files or docs to inspect.' },
        acceptanceCriteria: { type: 'array', items: { type: 'string' }, description: 'Checks that prove the change is complete.' },
        risks: { type: 'array', items: { type: 'string' }, description: 'Guardrails, risks, or approvals needed before execution.' },
        priority: { type: 'string', description: 'Optional priority such as high, medium, or low.' },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'check_jules_status',
    description: 'Check the status of a Jules task. If no sessionId is provided, return the latest Jules sessions.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Optional Jules session id returned by delegate_to_jules.' },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'start_orchestration',
    description: 'Start a saved orchestration flow by name (e.g. "run client onboarding"). The flow will ask questions one at a time; relay each question to the operator, then use answer_flow_question with their reply. Use list behavior: call with no flowName to hear which flows exist.',
    parameters: {
      type: 'object',
      properties: {
        flowName: { type: 'string', description: 'The saved flow name, e.g. "Client onboarding". Omit to list available flows.' },
        clientContext: { type: 'string', description: 'Client or context for the run, e.g. the new client\'s business name.' },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'answer_flow_question',
    description: 'Answer the current question of the active orchestration flow run with the operator\'s choice. Include detail when the answer carries a value (e.g. the domain name).',
    parameters: {
      type: 'object',
      properties: {
        answer: { type: 'string', description: 'The chosen option, matching one the flow offered (e.g. "Yes", "Has one", "Vercel").' },
        detail: { type: 'string', description: 'Optional captured value, e.g. "acmehardware.com".' },
      },
      required: ['answer'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'check_flow_status',
    description: 'Check the active orchestration flow run: current question, progress, or final result.',
    parameters: emptyParams,
  },
]

// --- Gemini Live support -----------------------------------------------------
// Convert the OpenAI Realtime tool list into Gemini Live functionDeclarations.
// Gemini accepts an OpenAPI-style schema subset, so keep only the keys it
// understands and drop OpenAI-only fields (the { type: 'function' } wrapper,
// additionalProperties, etc.). Used by /api/voice/gemini-live-token.
const GEMINI_BUILD_LANE_TOOLS = [
  {
    name: 'build_automation',
    description: 'Start a voice interview to build a real disabled automation draft. Open Automations, use the requested name, include the purpose if Carl already gave it, and return the next missing question.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short automation name.' },
        description: { type: 'string', description: 'What the automation should accomplish, if already stated.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'build_automation_answer',
    description: 'Record Carl\'s answer to the current automation interview question, update the disabled CRM draft, and return exactly the next missing question or the final draft summary.',
    parameters: {
      type: 'object',
      properties: { answer: { type: 'string', description: 'Carl\'s complete answer to the current question.' } },
      required: ['answer'],
    },
  },
  { name: 'build_automation_status', description: 'Read the active automation voice interview and return its progress and current question.', parameters: { type: 'object', properties: {} } },
  { name: 'cancel_automation_build', description: 'Stop the active automation interview while preserving the disabled draft for later.', parameters: { type: 'object', properties: {} } },
  { name: 'list_automations', description: 'List the real CRM automations and whether each is enabled or disabled.', parameters: { type: 'object', properties: {} } },
  { name: 'list_automation_templates', description: 'List reusable automation templates available in the CRM.', parameters: { type: 'object', properties: {} } },
  {
    name: 'automation_status',
    description: 'Read one real automation, including trigger, steps, assignment, and enabled state.',
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'Automation name.' } }, required: ['name'] },
  },
  {
    name: 'enable_automation',
    description: 'Prepare an exact approval preview for enabling a disabled automation. This does not enable it.',
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'Automation name.' } }, required: ['name'] },
  },
  {
    name: 'enable_automation_confirmed',
    description: 'Enable an automation only after Carl clearly approves the exact preview returned by enable_automation.',
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'Automation name from the approved preview.' } }, required: ['name'] },
  },
  {
    name: 'disable_automation',
    description: 'Disable an automation so it cannot run automatically.',
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'Automation name.' } }, required: ['name'] },
  },
  {
    name: 'run_automation',
    description: 'Prepare an exact approval preview for a manual automation run. This does not run it.',
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'Automation name.' } }, required: ['name'] },
  },
  {
    name: 'run_automation_confirmed',
    description: 'Run an automation only after Carl clearly approves the exact preview returned by run_automation.',
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'Automation name from the approved preview.' } }, required: ['name'] },
  },
  {
    name: 'create_agent_draft',
    description: 'Create a real disabled draft agent in Build > Agents after collecting its name and job. Never make it live or bind external voice services.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Agent name.' },
        job: { type: 'string', description: 'What the agent is responsible for and how success is measured.' },
        description: { type: 'string', description: 'Optional supporting description.' },
      },
      required: ['name', 'job'],
    },
  },
  {
    name: 'create_platform_draft',
    description: 'Register an inert platform record in Build > Platforms after collecting the minimum identity details. This does not deploy or connect credentials.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Display name.' },
        platformId: { type: 'string', description: 'Stable lowercase identifier, such as client-portal.' },
        url: { type: 'string', description: 'Required public or admin HTTPS URL.' },
        environment: { type: 'string', enum: ['production', 'staging'], description: 'Target environment.' },
        notes: { type: 'string', description: 'Purpose, owner, or setup notes.' },
      },
      required: ['name', 'platformId', 'url'],
    },
  },
  {
    name: 'create_campaign_draft',
    description: 'Create a review-only campaign draft in Build > Campaigns. It may generate draft posts, but it must not approve, schedule, publish, or send them.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Campaign or client name.' },
        objective: { type: 'string', description: 'Business outcome.' },
        audience: { type: 'string', description: 'Target audience.' },
        market: { type: 'string', description: 'Geographic or industry market.' },
        channels: { type: 'array', items: { type: 'string' }, description: 'Requested social channels; omit to use a safe review-only default.' },
      },
      required: ['name', 'objective', 'audience'],
    },
  },
]

function sanitizeGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return { type: 'object', properties: {} }
  const out = {}
  if (schema.type) out.type = schema.type
  if (schema.description) out.description = schema.description
  if (Array.isArray(schema.enum) && schema.enum.length) out.enum = schema.enum
  if (schema.items) out.items = sanitizeGeminiSchema(schema.items)
  if (schema.properties && typeof schema.properties === 'object') {
    out.properties = {}
    for (const [key, value] of Object.entries(schema.properties)) out.properties[key] = sanitizeGeminiSchema(value)
  }
  if (Array.isArray(schema.required) && schema.required.length) out.required = schema.required
  return out
}

export function toGeminiFunctionDeclarations() {
  return [...OPENAI_REALTIME_TOOLS, ...GEMINI_BUILD_LANE_TOOLS]
    .filter(tool => tool && tool.name)
    .map(tool => ({
      name: tool.name,
      description: tool.description || '',
      parameters: sanitizeGeminiSchema(tool.parameters),
    }))
}
