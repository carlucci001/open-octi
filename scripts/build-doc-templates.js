const fs = require('fs')
const path = require('path')
const BASE = path.join(process.cwd(), 'data', 'document-templates')
fs.mkdirSync(BASE, { recursive: true })

const DISCLAIMER = `> **⚠ Legal Notice**  This document is a starting template, not a finished legal contract. **Have your attorney review and customize this language before using it with clients.** Farrington Development LLC and any AI that filled in this template are not your lawyers.

---

`

const T = {}

T['web-app-development'] = {
  name: 'Web Application Development Agreement',
  category: 'Firm-to-Client',
  description: 'Custom web application build — full-stack, hosted, may include auth, DB, integrations.',
  placeholders: ['client_name','client_address','client_email','effective_date','scope_of_work','total_fee','payment_schedule','timeline','state_of_governing_law'],
  body: `# Web Application Development Agreement

**This Agreement** is made effective **{{effective_date}}** between **Farrington Development LLC**, a North Carolina limited liability company ("Developer"), and **{{client_name}}**, located at {{client_address}} ({{client_email}}) ("Client").

## 1. Services
Developer will design, build, test, and deploy a custom web application as further described in the Scope of Work below.

### Scope of Work
{{scope_of_work}}

## 2. Fees & Payment
Total project fee: **{{total_fee}}**. Payment schedule: {{payment_schedule}}. Invoices are due within 15 days of issue. Late payments accrue 1.5% monthly interest.

## 3. Timeline
Estimated timeline: {{timeline}}. Dates may shift with scope changes or Client-caused delays.

## 4. Intellectual Property
Upon receipt of all fees, Developer assigns to Client all copyright and IP rights in the deliverables built specifically for Client. Developer retains rights to general know-how, frameworks, and pre-existing tools.

## 5. Confidentiality
Each party will keep the other's non-public information confidential and use it only to perform this Agreement.

## 6. Warranties
Developer warrants the deliverables will materially conform to the Scope of Work for 30 days after delivery. **EXCEPT AS STATED, DELIVERABLES ARE PROVIDED "AS IS" WITHOUT ANY OTHER WARRANTIES.**

## 7. Limitation of Liability
Developer's total liability under this Agreement will not exceed fees paid by Client in the preceding 3 months. Neither party is liable for indirect or consequential damages.

## 8. Term & Termination
This Agreement remains in effect until the Services are complete or either party terminates for material breach with 15 days' written notice to cure. Client pays for all work performed through the termination date.

## 9. Governing Law
This Agreement is governed by the laws of the State of **{{state_of_governing_law}}**. Disputes will be resolved in the state and federal courts located in that state.

## 10. Entire Agreement
This document is the entire agreement between the parties on this subject and supersedes prior discussions. Changes must be in writing and signed by both parties.

---

**FARRINGTON DEVELOPMENT LLC**

Signature: _______________________  Date: ____________

Name: Carl Farrington, Owner

**CLIENT — {{client_name}}**

Signature: _______________________  Date: ____________

Name: ____________________________
`
}

T['website-design'] = {
  name: 'Website Design Agreement',
  category: 'Firm-to-Client',
  description: 'Marketing site / brand site design + build, typically static or CMS-driven.',
  placeholders: ['client_name','client_address','client_email','effective_date','scope_of_work','total_fee','payment_schedule','revisions_included','state_of_governing_law'],
  body: `# Website Design Agreement

**This Agreement** is made effective **{{effective_date}}** between **Farrington Development LLC** ("Designer") and **{{client_name}}**, {{client_address}} ({{client_email}}) ("Client").

## 1. Services
Designer will create a website design and implementation as described below.

### Scope of Work
{{scope_of_work}}

## 2. Fees
Total fee: **{{total_fee}}**. Payment schedule: {{payment_schedule}}. A 50% non-refundable deposit is required before work begins.

## 3. Revisions
Includes **{{revisions_included}}** rounds of revisions. Additional revisions billed at Designer's standard hourly rate.

## 4. Client Content
Client is responsible for providing text, images, and brand assets. Delays in supplying materials will push the timeline.

## 5. Intellectual Property
Upon full payment, Client owns the final website design and source files delivered for their use. Designer retains the right to display the work in portfolios.

## 6. Third-Party Assets
Stock photography, fonts, plugins, and third-party components are licensed under their respective terms. Client is responsible for any ongoing license fees after launch.

## 7. Hosting & Maintenance
Hosting and maintenance are **not** included unless a separate agreement is signed.

## 8. Warranties & Liability
Site is delivered "AS IS." Designer's liability is capped at the fees paid. No liability for third-party services (hosting, CMS, plugins) or content-driven issues.

## 9. Governing Law
Governed by **{{state_of_governing_law}}** law.

---

**FARRINGTON DEVELOPMENT LLC**

Signature: _______________________  Date: ____________

**{{client_name}}**

Signature: _______________________  Date: ____________
`
}

T['software-development'] = {
  name: 'Software Development Agreement',
  category: 'Firm-to-Client',
  description: 'General software development — CLIs, desktop apps, backend services, internal tools.',
  placeholders: ['client_name','client_address','client_email','effective_date','scope_of_work','total_fee','payment_schedule','timeline','state_of_governing_law'],
  body: `# Software Development Agreement

**This Agreement** is effective **{{effective_date}}** between **Farrington Development LLC** ("Developer") and **{{client_name}}**, {{client_address}} ({{client_email}}) ("Client").

## 1. Services
Developer will develop the software described in the Scope of Work.

### Scope of Work
{{scope_of_work}}

## 2. Fees
Total: **{{total_fee}}**. Schedule: {{payment_schedule}}.

## 3. Timeline
Estimated: {{timeline}}.

## 4. Deliverables & Acceptance
Developer will deliver the software per the Scope. Client has 10 business days to accept or provide written notice of material non-conformance. Silence after 10 days = acceptance.

## 5. IP Ownership
Upon full payment, Client owns the custom-developed code and documentation. Developer retains rights to pre-existing libraries, general knowledge, and any open-source components (which carry their own licenses).

## 6. Open Source
Deliverables may include open-source software under its own license terms. Those licenses govern that portion; Client is responsible for compliance.

## 7. Confidentiality
Each party keeps the other's non-public information confidential.

## 8. Warranty
30-day warranty against material defects in Developer-written code. Developer will repair defects reported during the warranty period at no charge.

## 9. Limitation of Liability
Capped at fees paid in the last 3 months. No indirect damages.

## 10. Governing Law
**{{state_of_governing_law}}**.

---

**Signed:**

Developer: __________________  Date: ______

Client: _____________________  Date: ______
`
}

T['nda-mutual'] = {
  name: 'Non-Disclosure Agreement (Mutual)',
  category: 'Legal — Foundational',
  description: 'Mutual NDA — both parties share and protect confidential information. Use early, before detailed discovery.',
  placeholders: ['client_name','client_address','effective_date','purpose_of_disclosure','term_years','state_of_governing_law'],
  body: `# Mutual Non-Disclosure Agreement

**This Agreement** is effective **{{effective_date}}** between **Farrington Development LLC**, City, ST ("Farrington"), and **{{client_name}}**, {{client_address}} ("Counterparty"). Each party is a "Discloser" when sharing information and a "Recipient" when receiving it.

## 1. Purpose
The parties wish to explore **{{purpose_of_disclosure}}** and may disclose confidential information to each other to evaluate the opportunity.

## 2. Confidential Information
"Confidential Information" means any non-public information disclosed by one party to the other, whether oral, written, or otherwise, including business plans, technical info, source code, customer data, financials, and unreleased products.

## 3. Exclusions
Confidential Information does **not** include information that is (a) publicly available through no fault of Recipient, (b) already known to Recipient without confidentiality obligation, (c) independently developed by Recipient without use of the other's Confidential Information, or (d) disclosed with Discloser's written permission.

## 4. Obligations
Recipient will:
- Use Confidential Information only for the Purpose above.
- Protect it with at least the same care it uses for its own confidential information (no less than reasonable care).
- Share it only with employees and contractors who need to know and are bound by similar confidentiality obligations.
- Not reverse-engineer, decompile, or attempt to derive source code.

## 5. Term
This Agreement lasts **{{term_years}} year(s)** from the Effective Date. Confidentiality obligations survive for **{{term_years}} year(s)** after termination.

## 6. Required Disclosure
If Recipient is legally compelled to disclose Confidential Information, it will give Discloser prompt notice so Discloser can seek a protective order.

## 7. No License
No license or IP rights are granted except the limited right to use information for the Purpose.

## 8. Remedies
Breach may cause irreparable harm for which money damages are inadequate. Discloser may seek injunctive relief.

## 9. Governing Law
**{{state_of_governing_law}}**.

---

**FARRINGTON DEVELOPMENT LLC**

Signature: _______________________  Date: ____________

**{{client_name}}**

Signature: _______________________  Date: ____________
`
}

T['msa'] = {
  name: 'Master Services Agreement (MSA)',
  category: 'Framework',
  description: 'Umbrella terms for ongoing or multi-project clients. Individual projects attach as SOWs.',
  placeholders: ['client_name','client_address','client_email','effective_date','state_of_governing_law'],
  body: `# Master Services Agreement

**This Master Services Agreement** ("MSA") is effective **{{effective_date}}** between **Farrington Development LLC** ("Provider") and **{{client_name}}**, {{client_address}} ({{client_email}}) ("Client").

## 1. Structure
This MSA governs all Services performed for Client. Each specific engagement will be documented in a **Statement of Work** ("SOW") signed by both parties. Each SOW references this MSA; if they conflict, the SOW controls for that specific engagement.

## 2. Fees & Payment
Each SOW specifies fees. Invoices are due within 15 days. Late: 1.5%/month.

## 3. Taxes
Fees do not include taxes. Client is responsible for applicable taxes except on Provider's net income.

## 4. IP Ownership
Each SOW specifies IP ownership for that work. Default: Client owns custom deliverables upon payment; Provider retains pre-existing tools, know-how, and general skills.

## 5. Confidentiality
Each party keeps the other's non-public information confidential for 3 years after disclosure.

## 6. Warranties & Disclaimer
Provider warrants deliverables will materially conform to the applicable SOW for 30 days after delivery. **OTHERWISE PROVIDED "AS IS."**

## 7. Limitation of Liability
Total liability capped at fees paid under the applicable SOW in the last 6 months. No indirect or consequential damages.

## 8. Term & Termination
This MSA remains in effect until terminated. Either party may terminate with 30 days' notice, but active SOWs continue under their own terms until complete or terminated per the SOW.

## 9. Independent Contractor
Provider is an independent contractor, not an employee of Client.

## 10. Non-Solicitation
During the term and for 12 months after, neither party will solicit the other's employees or contractors without written consent.

## 11. Governing Law
**{{state_of_governing_law}}**.

## 12. Entire Agreement
This MSA plus all signed SOWs is the entire agreement. Amendments must be in writing.

---

**Signed:**

Provider: __________________  Date: ______

Client: ____________________  Date: ______
`
}

T['sow'] = {
  name: 'Statement of Work (SOW)',
  category: 'Framework',
  description: 'Project-specific scope, signed under an existing MSA. Use for each distinct engagement.',
  placeholders: ['client_name','effective_date','project_name','scope_of_work','deliverables','timeline','total_fee','payment_schedule','msa_date'],
  body: `# Statement of Work — {{project_name}}

**SOW Effective Date:** {{effective_date}}
**Client:** {{client_name}}
**Governing MSA:** Master Services Agreement dated **{{msa_date}}**

## 1. Project
**{{project_name}}**

## 2. Scope of Work
{{scope_of_work}}

## 3. Deliverables
{{deliverables}}

## 4. Timeline
{{timeline}}

## 5. Fees
Total: **{{total_fee}}**

Payment schedule: {{payment_schedule}}

## 6. Acceptance
Client has 10 business days after each deliverable to accept or provide written notice of material non-conformance. Silence = acceptance.

## 7. Change Requests
Changes to this SOW require a written Change Order signed by both parties. Out-of-scope work is billed at Provider's standard rate.

## 8. Assumptions
- Client will provide timely feedback, content, credentials, and decisions.
- Delays caused by Client will push the timeline accordingly.
- Third-party service fees (hosting, APIs, licenses) are pass-through unless stated otherwise.

## 9. All Other Terms
All other terms are governed by the MSA dated **{{msa_date}}**.

---

**Signed:**

Provider (Farrington Development LLC): __________________  Date: ______

Client ({{client_name}}): __________________  Date: ______
`
}

T['maintenance-support'] = {
  name: 'Maintenance & Support Agreement',
  category: 'Ongoing',
  description: 'Post-launch care for a delivered project — bug fixes, patches, minor updates.',
  placeholders: ['client_name','client_address','effective_date','monthly_fee','support_hours','response_time_hours','covered_systems','state_of_governing_law'],
  body: `# Maintenance & Support Agreement

**Effective:** {{effective_date}}
**Provider:** Farrington Development LLC
**Client:** {{client_name}}, {{client_address}}

## 1. Covered Systems
{{covered_systems}}

## 2. Services Included
- Bug fixes and patches for Covered Systems
- Security updates and dependency upgrades
- Minor content and configuration changes (≤ 30 minutes each)
- Monitoring and uptime checks
- Response to email/ticket support requests

## 3. Hours
Up to **{{support_hours}}** hours per month. Unused hours do not roll over. Hours beyond the limit are billed at Provider's standard hourly rate.

## 4. Response Time
Provider will respond to support requests within **{{response_time_hours}} hours** during business hours (Mon–Fri, 9am–5pm ET, excluding US holidays).

## 5. Not Included
- New features or major redesigns (require a separate SOW)
- Third-party software support (Client deals with vendors directly)
- Data-entry work
- After-hours emergency support unless separately arranged

## 6. Fees
Monthly fee: **{{monthly_fee}}**, billed on the 1st of each month. Auto-renews monthly unless either party cancels with 30 days' notice.

## 7. Access
Client will provide Provider with admin access as needed. Client is responsible for credentials and revoking access on termination.

## 8. Termination
Either party may cancel with 30 days' written notice. No refunds for partial months.

## 9. Limitation of Liability
Provider's liability is capped at the monthly fee for the month the issue occurred.

## 10. Governing Law
**{{state_of_governing_law}}**.

---

**Signed:**

Provider: __________________  Date: ______

Client: ____________________  Date: ______
`
}

T['hosting'] = {
  name: 'Hosting & Managed Services Agreement',
  category: 'Ongoing',
  description: 'Provider-managed hosting of a client site or app. Includes uptime commitments.',
  placeholders: ['client_name','client_address','effective_date','monthly_fee','covered_properties','uptime_sla','state_of_governing_law'],
  body: `# Hosting & Managed Services Agreement

**Effective:** {{effective_date}}
**Provider:** Farrington Development LLC
**Client:** {{client_name}}, {{client_address}}

## 1. Properties Hosted
{{covered_properties}}

## 2. Services
- Server/cloud hosting and domain routing
- SSL certificate provisioning and renewal
- Weekly automated backups (30-day retention)
- Software stack security updates
- Basic monitoring and uptime alerts

## 3. Uptime SLA
Provider targets **{{uptime_sla}}** uptime measured monthly, excluding scheduled maintenance. Service credits apply for documented SLA breaches per Section 8.

## 4. Fees
Monthly fee: **{{monthly_fee}}**. Paid in advance on the 1st of each month. Auto-renews monthly.

## 5. Client Responsibilities
- Keep billing current — Provider may suspend on unpaid balances > 15 days.
- Secure Client-held credentials.
- Not upload illegal, infringing, or malicious content.
- Provide 30 days' notice before cancellation.

## 6. Backups & Data
Client retains all ownership of its data. Provider maintains backups for disaster recovery but is not Client's sole backup. Client should maintain an independent backup.

## 7. Termination
30 days' notice either direction. Provider will assist with transfer to a new host for up to 10 hours at no extra charge. Beyond 10 hours billed hourly.

## 8. SLA Credits
If uptime falls below the SLA in a given month, Client receives a credit of 5% of that month's fee per 1% below SLA, up to 50% of the monthly fee. Credits are the sole remedy for SLA breaches.

## 9. Limitation of Liability
Capped at 3 months of fees. No liability for Client data loss except as stated in Section 8.

## 10. Governing Law
**{{state_of_governing_law}}**.

---

**Signed:**

Provider: __________________  Date: ______

Client: ____________________  Date: ______
`
}

T['retainer'] = {
  name: 'Retainer Agreement',
  category: 'Ongoing',
  description: 'Monthly retainer for reserved capacity — guaranteed hours or priority access.',
  placeholders: ['client_name','client_address','effective_date','monthly_fee','reserved_hours','rollover_policy','scope_of_services','state_of_governing_law'],
  body: `# Retainer Agreement

**Effective:** {{effective_date}}
**Provider:** Farrington Development LLC
**Client:** {{client_name}}, {{client_address}}

## 1. Services
Provider will reserve capacity for Client each month as described below.

### Scope of Services
{{scope_of_services}}

## 2. Reserved Hours
**{{reserved_hours}}** hours per month are reserved for Client.

## 3. Rollover
{{rollover_policy}}

## 4. Fee
Monthly retainer: **{{monthly_fee}}**, billed in advance on the 1st. Auto-renews unless cancelled with 30 days' notice.

## 5. Overage
Hours beyond the reserved amount are billed at Provider's standard hourly rate.

## 6. Priority
Retainer clients receive priority scheduling over hourly/one-off clients.

## 7. Scope Boundaries
This retainer covers the Services above. Out-of-scope work requires a separate SOW.

## 8. Confidentiality
Standard mutual confidentiality applies for 3 years after termination.

## 9. IP
Work product ownership transfers to Client on payment. Provider retains pre-existing tools and general know-how.

## 10. Termination
30 days' notice either direction. Final month is pro-rated for any hours not yet used.

## 11. Governing Law
**{{state_of_governing_law}}**.

---

**Signed:**

Provider: __________________  Date: ______

Client: ____________________  Date: ______
`
}

T['consulting'] = {
  name: 'Consulting Agreement',
  category: 'Ongoing',
  description: 'Hourly advisory — strategy, technical review, architecture, training. No deliverables.',
  placeholders: ['client_name','client_address','effective_date','hourly_rate','scope_of_services','state_of_governing_law'],
  body: `# Consulting Agreement

**Effective:** {{effective_date}}
**Consultant:** Farrington Development LLC
**Client:** {{client_name}}, {{client_address}}

## 1. Services
Consultant will provide advisory services on an hourly basis.

### Scope
{{scope_of_services}}

## 2. Rate
**{{hourly_rate}}/hour**, billed in 15-minute increments. Travel time billed at 50%.

## 3. Expenses
Pre-approved out-of-pocket expenses (travel, tools, licenses) are billed at cost.

## 4. Invoicing
Consultant invoices monthly for hours worked. Payment due within 15 days.

## 5. No Deliverables Obligation
This is advisory work. Consultant provides recommendations and input, not specific deliverables. If Client needs deliverables (code, documents, designs), a separate SOW is required.

## 6. No Guarantees
Recommendations reflect Consultant's professional judgment; outcomes depend on factors outside Consultant's control. No guarantee of specific business results.

## 7. Confidentiality
Standard mutual confidentiality.

## 8. Limitation of Liability
Capped at fees paid in the prior 3 months. No indirect damages.

## 9. Term
Engagement continues until either party terminates with 10 days' written notice. Client pays for hours worked through the termination date.

## 10. Governing Law
**{{state_of_governing_law}}**.

---

**Signed:**

Consultant: __________________  Date: ______

Client: ______________________  Date: ______
`
}

T['ai-automation'] = {
  name: 'AI & Automation Services Agreement',
  category: 'Firm-to-Client',
  description: 'AI/agent/automation BUILD projects — model integration, agents, data pipelines. Covers model behavior, data use, and IP.',
  placeholders: ['client_name','client_address','client_email','effective_date','scope_of_work','total_fee','payment_schedule','timeline','data_handling_terms','state_of_governing_law'],
  body: `# AI & Automation Services Agreement

**Effective:** {{effective_date}}
**Provider:** Farrington Development LLC
**Client:** {{client_name}}, {{client_address}} ({{client_email}})

## 1. Services
Provider will design, build, and deliver AI and/or automation systems as described below. This may include LLM integrations, agent systems, data pipelines, or workflow automations.

### Scope of Work
{{scope_of_work}}

## 2. AI Limitations — Client Acknowledgment
Client acknowledges that AI-driven systems:
- Can produce incorrect, biased, or hallucinated outputs.
- May not be deterministic — same input may produce different outputs.
- Depend on third-party AI providers (e.g. OpenAI, Anthropic, DeepSeek, Google) whose availability, pricing, and terms can change.
- Require human review before acting on outputs in high-stakes workflows.

## 3. Data Handling
{{data_handling_terms}}

Unless stated otherwise:
- Provider will not use Client data to train models.
- Client data sent to third-party AI providers is governed by those providers' terms.
- Client is responsible for ensuring it has the right to process any personal or proprietary data it submits.

## 4. Fees
Total: **{{total_fee}}**. Schedule: {{payment_schedule}}.

## 5. Third-Party AI Costs
Ongoing costs for AI provider API usage (tokens, credits) are Client's responsibility unless explicitly bundled. Provider will document expected ranges; actual usage may vary.

## 6. Timeline
{{timeline}}. AI projects have higher variance — behavioral tuning and evaluation can extend timelines.

## 7. IP
Custom-developed code and prompt artifacts are Client's upon payment. Pre-existing Provider tooling, general prompt engineering techniques, and open-source components remain their respective owners'.

## 8. No Warranty for AI Output
**AI OUTPUTS ARE PROVIDED "AS IS" WITHOUT WARRANTY OF ACCURACY, COMPLETENESS, OR FITNESS.** Client is responsible for reviewing, validating, and monitoring outputs before relying on them.

## 9. Limitation of Liability
Capped at fees paid in the prior 3 months. No liability for AI-produced content, decisions made based on AI outputs, or third-party provider outages.

## 10. Indemnification
Client will indemnify Provider for claims arising from Client's use of the delivered AI system against Client's customers or end-users.

## 11. Governing Law
**{{state_of_governing_law}}**.

---

**Signed:**

Provider: __________________  Date: ______

Client: ____________________  Date: ______
`
}

T['ai-consulting'] = {
  name: 'AI Consulting Agreement',
  category: 'Ongoing',
  description: 'Hourly advisory for AI/ML projects — model strategy, prompt engineering, agent architecture, evaluation, data strategy. No build deliverables.',
  placeholders: ['client_name','client_address','effective_date','hourly_rate','scope_of_services','state_of_governing_law'],
  body: `# AI Consulting Agreement

**Effective:** {{effective_date}}
**Consultant:** Farrington Development LLC
**Client:** {{client_name}}, {{client_address}}

## 1. Services
Consultant provides hourly AI and machine-learning advisory. This engagement is advisory only — not a build agreement. For implementation work, a separate AI & Automation Services Agreement or SOW is required.

### Scope
{{scope_of_services}}

Typical scope includes:
- Model selection (OpenAI, Anthropic, Google, open-source)
- Prompt engineering review and optimization
- Agent architecture design and evaluation
- RAG / retrieval strategy
- Safety, evaluation, and red-teaming recommendations
- Cost modeling and provider comparison
- AI policy and governance guidance

## 2. Rate
**{{hourly_rate}}/hour**, billed in 15-minute increments. Travel time billed at 50%.

## 3. AI Landscape Disclosure
Client acknowledges:
- AI tools, APIs, pricing, and provider capabilities change rapidly. Recommendations valid today may need revision within weeks or months.
- Consultant will base recommendations on the best information available at the time.
- Consultant does not control the underlying AI providers or their policies.
- Outputs from any recommended model may be inaccurate, biased, or unpredictable.

## 4. No Guarantees
Recommendations reflect Consultant's professional judgment. Specific accuracy, cost, or business outcomes are not guaranteed.

## 5. Data Handling During Engagement
- Do not share third parties' confidential data or regulated personal data (HIPAA, GDPR-scope, etc.) with Consultant without explicit written agreement on handling.
- Sample data shared for advisory review is used solely to inform recommendations and is not retained after the engagement.

## 6. Expenses
Pre-approved AI provider API credits or tool subscriptions used during the engagement are billed at cost or pass-through.

## 7. Invoicing
Monthly for hours worked. Due in 15 days. Late: 1.5%/month.

## 8. Confidentiality
Standard mutual confidentiality — survives 3 years after termination.

## 9. No Conflicting Advice
Consultant may work with other clients in related industries. Consultant will not share Client's confidential information with competitors.

## 10. Limitation of Liability
Capped at fees paid in the prior 3 months. No liability for AI outputs or decisions made based on Consultant's recommendations.

## 11. Term
Continues until either party terminates with 10 days' written notice. Client pays for hours worked through termination.

## 12. Governing Law
**{{state_of_governing_law}}**.

---

**Signed:**

Consultant: __________________  Date: ______

Client: ______________________  Date: ______
`
}

T['website-tos'] = {
  name: 'Website Terms of Service (Client Deliverable)',
  category: 'Client Deliverable',
  description: 'ToS template to drop onto a client\'s website. Customize for their business model.',
  placeholders: ['client_business_name','client_website_url','effective_date','contact_email','state_of_governing_law','type_of_business'],
  body: `# Terms of Service

**Effective Date:** {{effective_date}}

Welcome to **{{client_business_name}}** ("we," "us," or "our"). These Terms of Service ("Terms") govern your use of the website **{{client_website_url}}** and any related services (the "Service"). By using the Service, you agree to these Terms.

## 1. Eligibility
You must be at least 13 years old (or the age of digital consent in your jurisdiction) to use the Service. By using the Service, you represent you meet this requirement.

## 2. Accounts
If you create an account, you are responsible for maintaining its security and for all activity under it. Provide accurate, current, and complete information.

## 3. Acceptable Use
You agree not to:
- Use the Service for any illegal purpose or in violation of any laws.
- Infringe anyone's intellectual property rights.
- Upload malicious code or attempt to breach security.
- Interfere with or disrupt the Service or other users.
- Scrape, reverse-engineer, or copy the Service without permission.

## 4. Our Content
All content on the Service (text, images, logos, software) is owned by us or our licensors and is protected by law. We grant you a limited, non-exclusive, revocable license to access and use it for personal, non-commercial purposes.

## 5. User Content
You retain ownership of content you submit. By submitting content, you grant us a worldwide, royalty-free license to use, display, and distribute it as part of operating the Service. You represent you have the rights to do so.

## 6. Purchases
[CUSTOMIZE: Include specific terms for {{type_of_business}} if you sell products, accept payments, or offer subscriptions. Address pricing, payment, refunds, and cancellations.]

## 7. Third-Party Services
The Service may link to or rely on third-party services. We are not responsible for third-party content or services.

## 8. Termination
We may suspend or terminate your access at any time, with or without notice, for any reason including violation of these Terms.

## 9. Disclaimers
THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DISCLAIM ALL WARRANTIES INCLUDING MERCHANTABILITY, FITNESS, AND NON-INFRINGEMENT.

## 10. Limitation of Liability
TO THE EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY FOR ANY CLAIM RELATED TO THE SERVICE IS LIMITED TO $100 OR THE AMOUNT YOU PAID US IN THE LAST 12 MONTHS, WHICHEVER IS GREATER. WE ARE NOT LIABLE FOR INDIRECT OR CONSEQUENTIAL DAMAGES.

## 11. Changes
We may update these Terms. Continued use after changes = acceptance. We'll post the effective date at the top.

## 12. Governing Law
These Terms are governed by the laws of **{{state_of_governing_law}}**, without regard to conflicts of law principles.

## 13. Contact
Questions? Email **{{contact_email}}**.
`
}

T['website-privacy'] = {
  name: 'Website Privacy Policy (Client Deliverable)',
  category: 'Client Deliverable',
  description: 'Privacy policy template for a client\'s website. Customize for actual data practices.',
  placeholders: ['client_business_name','client_website_url','effective_date','contact_email','state_of_governing_law'],
  body: `# Privacy Policy

**Effective Date:** {{effective_date}}

**{{client_business_name}}** ("we," "us," or "our") respects your privacy. This Privacy Policy explains how we collect, use, and share your information when you use **{{client_website_url}}**.

## 1. Information We Collect

**Information you provide:** Name, email, phone, billing/shipping address, and anything else you submit through forms or account registration.

**Information collected automatically:** IP address, browser type, device info, pages visited, referring URL, and cookies/similar technologies.

**Information from third parties:** If you sign in with a third-party service (Google, Facebook), we receive basic profile info per that service's permissions.

## 2. How We Use It
- Provide and operate the Service.
- Process transactions and deliver products/services.
- Respond to inquiries and provide support.
- Send service-related communications.
- Send marketing (only if you've opted in — you can opt out anytime).
- Analyze usage to improve the Service.
- Comply with legal obligations.

## 3. Cookies & Tracking
We use cookies for authentication, preferences, and analytics. You can disable cookies in your browser, but some features may not work. We may use Google Analytics or similar tools.

## 4. Sharing
We do **not** sell your personal information. We share info only:
- With service providers who help us operate (hosting, payment processors, email, analytics) under confidentiality.
- When required by law or to respond to legal requests.
- In a business transfer (merger, acquisition).
- With your consent.

## 5. Data Retention
We keep information as long as needed to provide the Service and meet legal obligations, then delete or anonymize it.

## 6. Your Rights
Depending on your location (CA, EU, UK, and others), you may have rights to:
- Access the information we have about you.
- Correct inaccuracies.
- Delete your information.
- Opt out of marketing.
- Object to or restrict certain processing.
- Data portability.

To exercise these rights, email **{{contact_email}}**.

## 7. Children
The Service is not directed to children under 13 (or 16 in the EU). We do not knowingly collect info from children. If you believe we have, contact us and we'll delete it.

## 8. Security
We use reasonable technical and organizational measures to protect your information. No system is 100% secure.

## 9. International Transfers
We're based in the United States. If you're outside the US, your information may be transferred to and processed here.

## 10. Changes
We may update this Policy. We'll post the new effective date at the top.

## 11. Governing Law
Governed by **{{state_of_governing_law}}** law.

## 12. Contact
Email: **{{contact_email}}**
`
}

T['ai-usage-policy'] = {
  name: 'AI Usage Policy (Client Deliverable)',
  category: 'Client Deliverable',
  description: 'AI Usage Policy for a client whose product uses AI. Discloses AI presence, data use, and limits.',
  placeholders: ['client_business_name','client_website_url','effective_date','contact_email','ai_features_list','ai_providers_list'],
  body: `# AI Usage Policy

**Effective Date:** {{effective_date}}

**{{client_business_name}}** ("we," "us," "our") uses artificial intelligence ("AI") to power certain features of **{{client_website_url}}** and its related services. This policy explains what AI does here, how it uses your data, and what its limits are. It is an additional disclosure on top of our Terms of Service and Privacy Policy.

## 1. Where We Use AI
{{ai_features_list}}

## 2. AI Providers
We use the following AI providers to power these features:
{{ai_providers_list}}

These providers have their own privacy and data-handling practices. When you interact with AI features, information you submit may be processed by these providers under their terms.

## 3. What AI Does and Doesn't Do
- AI can generate text, summaries, suggestions, and automated responses.
- AI outputs are **generated, not verified facts**. They may contain errors, omissions, or hallucinations.
- AI is a tool; it does not replace human judgment on matters with legal, medical, financial, safety, or other high-stakes consequences.

## 4. Your Responsibility
You agree to:
- Review AI outputs before relying on them for any important decision.
- Not treat AI output as professional advice (legal, medical, financial).
- Not submit information through AI features that you don't have the right to share (e.g. confidential info belonging to a third party).

## 5. Data Use for AI
- Information you submit to AI features is processed to generate a response to you.
- We do **not** use your submissions to train third-party AI models unless expressly stated.
- We may retain AI interactions in aggregated, de-identified form for quality monitoring and abuse prevention.

## 6. Opt-Out
Where feasible, we provide alternatives to AI-generated responses. Contact **{{contact_email}}** if you need a human-only experience.

## 7. Content Provenance
AI-generated content on the Service is typically labeled as such. If you're unsure whether content is AI-generated, ask.

## 8. Prohibited Use of AI Features
Do not use our AI features to:
- Generate illegal, harassing, defamatory, or infringing content.
- Impersonate others, including public figures.
- Produce deceptive media or disinformation.
- Attempt to extract training data, evade safety filters, or reverse-engineer models.

Violations may result in account suspension.

## 9. No Warranty
AI OUTPUT IS PROVIDED "AS IS." WE DISCLAIM WARRANTIES OF ACCURACY, RELIABILITY, AND FITNESS OF AI OUTPUTS.

## 10. Changes
We may update this policy as our AI use evolves. We'll post the new effective date at the top.

## 11. Contact
Questions about our AI use? Email **{{contact_email}}**.
`
}

let written = 0
const index = []
for (const [id, tpl] of Object.entries(T)) {
  const file = path.join(BASE, `${id}.md`)
  fs.writeFileSync(file, DISCLAIMER + tpl.body)
  index.push({
    id,
    name: tpl.name,
    category: tpl.category,
    description: tpl.description,
    placeholders: tpl.placeholders,
    file: `${id}.md`,
  })
  written++
}

fs.writeFileSync(path.join(BASE, '_index.json'), JSON.stringify({ templates: index }, null, 2))

console.log(`Wrote ${written} template files to ${BASE}`)
for (const e of index) console.log(`  ${e.id} — ${e.name}`)
