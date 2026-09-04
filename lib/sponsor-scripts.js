

export const DEFAULT_SCRIPTS = [
  {
    id: "script-a",
    name: "The Community Champion",
    tag: "A",
    description: "Lead with community mission and local pride. Uses identity psychology — positions the prospect as a community leader, not a buyer. Leverages loss aversion with limited slots.",
    sections: [
      {
        heading: "Opening (pattern interrupt — don't sound like a salesperson)",
        lines: [
          "Hi, this is Carl with [PAPER NAME]. I'm not sure if I've got the right person — who handles your marketing or community partnerships?",
          "[If gatekeeper: 'I appreciate that — this is about a founding partnership for the new community newspaper launching in [MARKET]. They'll want to hear about it. Can I get 90 seconds?']",
          "[If owner/decision-maker: continue below]",
        ],
      },
      {
        heading: "Hook (curiosity + local relevance — first 15 seconds decide everything)",
        lines: [
          "Perfect — I'll be quick because I know you're busy. We're launching [PAPER NAME], a professional community newspaper for [MARKET], and I'm personally calling the six businesses that people told me are the heartbeat of this community.",
          "Your name came up as THE [BUSINESS TYPE] people trust around here. That's why I'm calling you first.",
        ],
      },
      {
        heading: "The Pitch (identity framing — 'you ARE this community')",
        lines: [
          "Here's what we're doing — and it's different from anything you've seen. We're building a real newspaper for [MARKET]. Not a blog. Not a Facebook page. A legitimate news source that covers what matters to the people who live here.",
          "We're using the same AI tools that the big media companies use to pump out clickbait — but we're pointing them at YOUR community. Local news. Local sports. Local business. Real stories about real people.",
          "Think of it as using fire against fire. The big boys used this technology to destroy local news. We're using it to bring it back.",
          "We have exactly six Founding Sponsor slots — one per content section. You would OWN the [CATEGORY] section. Your brand on every article header, sidebar, and footer. Unlimited sponsored content. Zero competitors in your category. For twelve months, you ARE [CATEGORY] in [MARKET].",
        ],
      },
      {
        heading: "The Close (scarcity + social proof + commitment ladder)",
        lines: [
          "The investment is [$PRICE] for the year — that's about [$MONTHLY] a month to be the exclusive voice in [CATEGORY] for the entire market. No other [BUSINESS TYPE] can buy in once you're there.",
          "I've already had conversations with a couple businesses about this same slot, so I want to give you first right of refusal since your name kept coming up.",
          "Can I send you the sponsorship package right now so you can see exactly what you'd get? I can have it in your inbox in two minutes.",
        ],
      },
      {
        heading: "Before You Go (drop-dead last chance — only if they're walking away)",
        lines: [
          "Hey — before you go, let me just say one thing. I'm not looking for a customer here. I'm looking to build a relationship with a partner in [MARKET]. Someone who wants to be part of bringing real news back to their community.",
          "The only thing I need from you is a commitment — not money today, just a 'yes, I want this slot.' I'll hold it for you for 48 hours, send you everything, and if it's not a fit after you see it, no hard feelings. But if I give this slot to your competitor down the street and you see their name on every article next month? That's going to sting.",
          "All I'm asking is: do you want me to hold YOUR spot, or should I call the next [BUSINESS TYPE] on my list?",
        ],
      },
    ],
    objections: [
      {
        obj: "I don't have the budget for that right now.",
        response: "I totally get that. Here's the thing — this is a founding rate. Once we launch and build the audience, these slots go up significantly. You're basically locking in the lowest price this will ever be. And at [$MONTHLY]/month, you're paying less than a single newspaper ad used to cost — except you own the ENTIRE section. Can we at least get the info in front of you so you can see the value before deciding?",
      },
      {
        obj: "I need to think about it.",
        response: "Absolutely, take your time. The only reason I mention urgency is I do have other [BUSINESS TYPE]s interested in this same category. I can't hold it without a commitment, but I CAN send you everything right now and give you until [2 DAYS FROM NOW] before I move to the next conversation. Fair enough?",
      },
      {
        obj: "We already do our marketing through social media / Google.",
        response: "That's smart — and this actually complements that perfectly. Social media is pay-to-play and you're competing with every other business for attention. With this, you're THE brand associated with [CATEGORY] news. When someone reads a local sports story, YOUR name is right there. It's brand authority you can't buy on Facebook. And honestly, the businesses that show up in their community newspaper alongside real journalism? People trust those brands differently.",
      },
      {
        obj: "What's the audience / how many readers?",
        response: "Great question. We're launching with aggressive local SEO, Google News indexing, and social distribution built in from day one — these are the same tools the big publishers use. Our flagship paper, WNC Times in City, ST already proving the model. But here's the real answer: as a Founding Sponsor, you're not buying impressions — you're buying ownership of a category before anyone else can. The audience grows, your visibility grows with it, and your rate stays locked.",
      },
      {
        obj: "I've never heard of you / this sounds too new.",
        response: "That's exactly why this is an opportunity. You know how people talk about wishing they'd gotten in on the ground floor? This is that moment. We're backed by real technology, real journalism standards, and we're already operating in other markets. Being a Founding Sponsor means you're not just advertising — you're part of the story of bringing real news back to [MARKET]. That's something your customers will notice.",
      },
      {
        obj: "Can you send me information and I'll look at it?",
        response: "Absolutely — I'll send the full package right now. Quick question before I do: if what you see checks out, are you the person who'd make this decision, or should I include anyone else on that email? [Gets commitment and identifies decision-maker]",
      },
    ],
    active: true,
    stats: { calls: 0, interested: 0, closed: 0 },
  },
  {
    id: "script-b",
    name: "The ROI Closer",
    tag: "B",
    description: "Lead with numbers and business value. Uses anchoring psychology — compare cost to alternatives they already spend on. Frames as investment, not expense.",
    sections: [
      {
        heading: "Opening (direct, businesslike — respect their time)",
        lines: [
          "Hi, this is Carl with [PAPER NAME]. I've got a business opportunity that takes 60 seconds to explain — do you have a minute?",
          "[If no: 'Totally fair. When's a better 60 seconds? I promise it'll be worth it.']",
        ],
      },
      {
        heading: "Hook (anchoring — make them think about what they already spend)",
        lines: [
          "Quick question: what are you spending per month right now on advertising — Google Ads, social media, print, sponsorships, all of it combined?",
          "[Let them answer or deflect — the point is to get them thinking about their current spend]",
          "The reason I ask is I've got something that probably costs less than what you spend on Google in a month, but gives you something Google never can — exclusive category ownership in your community's newspaper.",
        ],
      },
      {
        heading: "The Pitch (ROI framing — every dollar justified)",
        lines: [
          "We're launching [PAPER NAME], a professional community newspaper for [MARKET]. Not a flyer. Not a coupon mailer. A real news outlet indexed on Google News that people will read every day.",
          "We have six sponsorship categories. One sponsor per category. You would be the ONLY [BUSINESS TYPE] in the [CATEGORY] section.",
          "That means: your logo on every article header and sidebar. Unlimited branded content — we write stories that feature your business. Zero competition in your section. For a full year.",
          "Compare that to a Google ad that disappears the second you stop paying. Or a Facebook post that reaches 3% of your followers. This is permanent, exclusive brand real estate in your community.",
        ],
      },
      {
        heading: "The Close (price anchoring + urgency)",
        lines: [
          "The founding rate is [$PRICE] for the full year. That's [$MONTHLY] a month. Most businesses spend that on a single boosted Facebook post that's gone in 48 hours.",
          "At this price, your cost per impression is going to be a fraction of any digital ad — and you get the brand credibility of being associated with real community journalism.",
          "I'm reaching out to [BUSINESS TYPE]s this week for the [CATEGORY] slot. Once it's taken, it's locked for 12 months. Want me to send the package so you can see exactly what you'd own?",
        ],
      },
      {
        heading: "Before You Go (loss aversion + competitor threat)",
        lines: [
          "Listen — before I let you go, I want to be straight with you. I'm building a list of partners in [MARKET]. Not advertisers. Partners. People who want to be associated with something that actually matters in their community.",
          "I don't need your money today. I just need to know: are you in or should I move on? Because the [BUSINESS TYPE] I call next is going to say yes, and then that [CATEGORY] slot is gone for 12 months. I'd rather it be you.",
          "Let me hold it for 48 hours. I'll send everything over. You look at the numbers — if it doesn't make sense, just tell me. But don't lose this by default. Fair?",
        ],
      },
    ],
    objections: [
      {
        obj: "That's too expensive.",
        response: "I hear you. Let me put it this way: [$MONTHLY] a month is what — two or three Google Ad clicks in your industry? Except those clicks vanish. This gives you permanent placement, branded content, and zero competitors for a year. If you got just ONE new customer from this, what's that customer worth to you over their lifetime? Usually it pays for itself multiple times over.",
      },
      {
        obj: "We tried newspaper advertising before and it didn't work.",
        response: "I appreciate you sharing that — and honestly, old-school newspaper ads didn't work for most people. This is completely different. You're not buying a small box ad that gets skipped. You OWN the section. Your brand wraps the content. We create stories that feature your business. It's more like a media partnership than an ad buy. The businesses who succeed are the ones who stop buying ads and start building authority.",
      },
      {
        obj: "Let me talk to my partner / spouse / board.",
        response: "Absolutely — and I want to make sure they have everything they need to see the value. Let me send the full sponsorship package right now. Can we set a quick 10-minute follow-up call for [2 DAYS OUT] so I can answer any questions they have? I just want to make sure you have a fair shot before someone else takes the [CATEGORY] slot.",
      },
      {
        obj: "How is this different from the other advertising I get pitched?",
        response: "Every other pitch is asking you to rent space — a billboard for a month, an ad for a week, a sponsored post for a day. This is ownership. For 12 months, no one else in [MARKET] can claim the [CATEGORY] section. You're not sharing a page with competitors. You're the brand people associate with [CATEGORY] in their community. There's nothing else like it.",
      },
    ],
    active: true,
    stats: { calls: 0, interested: 0, closed: 0 },
  },
  {
    id: "script-c",
    name: "The Civic Partner",
    tag: "C",
    description: "Tailored for chambers, TDAs, tourism boards, and public-facing orgs. Uses reciprocity and civic duty framing — positions sponsorship as fulfilling their existing mission.",
    sections: [
      {
        heading: "Opening (peer-level, mission-aligned)",
        lines: [
          "Hi, this is Carl Farrington. I run a community news platform called ContentStudio, and I'm reaching out because what we're building directly aligns with what [ORG NAME] does for [MARKET]. Do you have two minutes?",
        ],
      },
      {
        heading: "Hook (mission alignment — make THEIR job easier)",
        lines: [
          "I've been following what [ORG NAME] does for the community, and honestly, you're doing the work that makes [MARKET] worth living in. The problem is — who's telling that story?",
          "Local news is dying everywhere. The papers that used to cover your events, your member businesses, your economic development wins — most of them are gone or gutted. That's where we come in.",
        ],
      },
      {
        heading: "The Pitch (reciprocity — we help you, you help us)",
        lines: [
          "We're launching [PAPER NAME], a professional AI-powered community newspaper dedicated to [MARKET]. Real journalism, real coverage, indexed on Google News — but focused entirely on what matters locally.",
          "We're building this with six Founding Sponsors who each own an entire content section. For an organization like yours, the [CATEGORY] section is a natural fit.",
          "Here's what that means practically: every story in [CATEGORY] carries your brand. We can publish your events, highlight your members, cover your initiatives — and it looks like editorial coverage, not paid advertising. Because it IS real coverage. You just happen to be the presenting sponsor.",
          "Your members get visibility. Your events get covered. Your mission gets amplified. And [MARKET] gets a real newspaper again.",
        ],
      },
      {
        heading: "The Close (partnership framing — not a sales close)",
        lines: [
          "The Founding Sponsor investment is [$PRICE] for the year. For a chamber or TDA budget, that's a rounding error compared to the visibility you'd get.",
          "I'd love to set up a 15-minute call with whoever handles your marketing partnerships to walk through the full package. Or I can send everything over right now if you'd prefer to review it first.",
          "Who would be the best person to loop in on this?",
        ],
      },
      {
        heading: "Before You Go (civic duty + legacy framing)",
        lines: [
          "One last thing before I let you go. I know [ORG NAME] gets pitched constantly. But this isn't a sponsorship pitch — this is an invitation to be part of the solution.",
          "Communities that lose their local news lose everything that comes with it — accountability, civic engagement, shared identity. You already know this because it's literally your mission to keep [MARKET] strong.",
          "I'm not asking for a check. I'm asking for a commitment to explore this. Let me hold the [CATEGORY] section for [ORG NAME] for 48 hours while your team reviews. If it's not the right fit, I'll move on. But I want to make sure you had a real shot at this before I offer it to someone else. Can I do that?",
        ],
      },
    ],
    objections: [
      {
        obj: "We have a limited marketing budget.",
        response: "Totally understand — and that's exactly why this makes sense. Instead of spreading your budget across ten different things that each get marginal results, this gives you year-round presence in the community's newspaper. Your events get covered. Your members get highlighted. It's marketing, PR, and community engagement rolled into one line item.",
      },
      {
        obj: "We need to run this by the board / committee.",
        response: "Of course — and I want to make that easy for you. Let me send the full package with the ROI breakdown, and I can also provide a one-page summary that's board-ready. When's your next board meeting? I want to make sure you have time to review before someone else commits to the [CATEGORY] section.",
      },
      {
        obj: "We already have a relationship with the local paper / media.",
        response: "That's great — and this isn't about replacing that. This is additive. The reality is, one outlet isn't enough anymore. People consume news from multiple sources, and Google News indexing means our articles show up when people search for [MARKET]. Your current media relationships cover one channel. This opens up another one — with your brand permanently embedded in it.",
      },
      {
        obj: "What's the readership?",
        response: "We're launching with built-in distribution — Google News indexing, local SEO optimization, and social media syndication from day one. But here's what matters for an organization like yours: this isn't about eyeballs on ads. It's about your brand being permanently associated with community journalism in [MARKET]. Every article in your section reinforces that [ORG NAME] is invested in this community. That kind of brand equity compounds over time.",
      },
    ],
    active: true,
    stats: { calls: 0, interested: 0, closed: 0 },
  },
];

// ═══════════════════════════════════════════════════════════════
// NEWSPAPER OUTREACH SCRIPTS (Campaign: Newspaper Upgrade)
// ═══════════════════════════════════════════════════════════════

export const NEWSPAPER_SCRIPTS = [
  {
    id: "np-script-d",
    name: "The Tech Rescue",
    tag: "D",
    description: "Lead with empathy for their daily struggle. Position AIOS as the cavalry — the technology layer they've needed but couldn't afford or build. Works best with smaller papers that are clearly under-resourced.",
    sections: [
      {
        heading: "Opening (warm, peer-to-peer — you're both in the news business)",
        lines: [
          "Hi, this is Carl Farrington. I run a community news platform, and I've been looking at newspapers in [STATE]. I found [THEIR PAPER] and wanted to reach out — do you have a couple minutes?",
          "[If gatekeeper: 'I'm calling about a technology partnership for the paper. Who handles the digital side or would be best to talk to about that?']",
        ],
      },
      {
        heading: "Hook (empathy + recognition — make them feel seen)",
        lines: [
          "I've been in the web business for 30 years, and I've watched what's happened to community newspapers. The big publishers got all the AI tools, all the SEO optimization, all the Google News juice — and papers like yours got left behind. Not because you're not good at what you do, but because the technology moved too fast.",
          "That's exactly why I built what I'm about to tell you about.",
        ],
      },
      {
        heading: "The Pitch (relief — this is the solution to problems they already know they have)",
        lines: [
          "I built a platform called ContentStudio. It gives community newspapers the same AI-powered tools that the big media companies use — but it's built specifically for papers like [THEIR PAPER].",
          "Here's what it does: AI-assisted article generation for local news, sports, business, and events. A modern, mobile-first website that's indexed on Google News from day one. Built-in SEO that actually gets your stories found. And a sponsor system where local businesses pay $2,500 to $5,000 a year to own a content category — revenue you keep.",
          "The key thing is — you keep your name, your brand, your editorial voice. We just give you the technology backbone so you can compete again.",
          "Our flagship paper, WNC Times in City, ST already live and proving the model. I can send you the link so you can see exactly what your paper would look like.",
        ],
      },
      {
        heading: "The Close (low-pressure — just get them to look)",
        lines: [
          "I'm not asking for a commitment right now. What I'd love to do is send you a quick email with a link to get set up — it's free to start, no credit card, and you can have a live paper in 24 hours to see if it's a fit.",
          "Can I get your email to send that over? And if you'd rather see it in action first, I can set up a 15-minute demo on Google Meet — I'll walk you through the whole platform live.",
        ],
      },
    ],
    objections: [
      {
        obj: "We already have a website / we're doing fine.",
        response: "That's great — and I'm not suggesting you throw anything away. What I'm offering is a technology layer on top of what you do. The AI handles the volume — local sports scores, event listings, business news — so you can focus on the stories that actually need a human touch. And the sponsor revenue system alone could add $15,000-17,000 a year to your bottom line. Worth a look?",
      },
      {
        obj: "I don't trust AI / AI can't do journalism.",
        response: "I respect that — and honestly, I agree with you. AI can't replace a journalist. What it CAN do is handle the 80% of local content that's factual and routine — meeting agendas, sports scores, event listings, business openings. That frees your team to do the real journalism. Think of it as having a tireless intern who handles the grunt work.",
      },
      {
        obj: "We don't have the budget for new technology.",
        response: "That's the best part — it's free to start, and the platform pays for itself through the built-in sponsor system. Six sponsors at $2,500-5,000 each puts $15,000-17,000 in your pocket in year one. The technology doesn't cost you — it makes you money.",
      },
      {
        obj: "I need to think about it / talk to my team.",
        response: "Absolutely. Let me send you the link and an email you can share with your team. I'll also include a Google Meet scheduling link — if anyone on your team wants to see a live walkthrough, they can book a 15-minute slot. There's no deadline pressure here — but I will say, we're onboarding papers market by market, and once someone sets up in [CITY], that's the paper for that market. So it's worth taking a look sooner rather than later.",
      },
      {
        obj: "What's the catch? / How do you make money?",
        response: "Fair question. We take a platform fee from the subscription, and as the network grows, there are network-level advertising opportunities. But the local sponsor revenue is 100% yours. We make money when you succeed — our interests are completely aligned.",
      },
    ],
    active: true,
    stats: { calls: 0, interested: 0, closed: 0 },
  },
  {
    id: "np-script-e",
    name: "The Revenue Unlock",
    tag: "E",
    description: "Lead with money. Most community papers are struggling financially. Show them the sponsor revenue model first, then the technology. Works best with papers that are clearly monetization-challenged.",
    sections: [
      {
        heading: "Opening (direct, business-focused)",
        lines: [
          "Hi, this is Carl Farrington. I run ContentStudio — we're an AI platform for community newspapers. I'm calling because I've got a way for [THEIR PAPER] to add $15,000 to $17,000 in annual revenue. Got 90 seconds?",
          "[If no: 'Totally fair — when's a better 90 seconds? This is about revenue, not a sales pitch.']",
        ],
      },
      {
        heading: "Hook (money first — get their attention)",
        lines: [
          "Quick question: how are you currently monetizing [THEIR PAPER]? Display ads? Subscriptions? Sponsored content?",
          "[Let them answer — the point is to surface their revenue pain]",
          "The reason I ask is we built a sponsor model specifically for community newspapers that's completely different from traditional advertising. Instead of selling cheap banner ads to dozens of businesses, you sell EXCLUSIVE category ownership to just six sponsors — one per content section — at $2,500 to $5,000 a year each.",
        ],
      },
      {
        heading: "The Pitch (revenue model + technology as the enabler)",
        lines: [
          "Here's how it works. Your paper has six content categories — Local News, Sports, Business, Lifestyle, Opinion, Events. Each category gets ONE founding sponsor. That sponsor owns the header, sidebar, and footer on every article in their section. They get unlimited sponsored content. And zero competitors.",
          "Businesses pay a premium for that exclusivity. We're seeing $2,500 for standard categories and $5,000 for Local News anchors. That's $17,500 a year from just six sponsors.",
          "And the platform handles everything else — AI-powered article generation, a modern website, Google News indexing, SEO optimization. Your paper looks professional, publishes consistently, and the sponsors see the value because there's always fresh content for their brand to be associated with.",
          "You keep your brand. You keep your editorial voice. You keep the sponsor revenue. We provide the technology.",
        ],
      },
      {
        heading: "The Close (get them to the signup page)",
        lines: [
          "I want to get you set up so you can see this for yourself. It's free to start — no credit card, no commitment. You'll have a live paper in 24 hours.",
          "Once you see it, you'll understand why businesses are willing to pay $5,000 a year to be the exclusive Local News sponsor. Can I get your email to send the setup link?",
          "Or if you want to see it first, I'll include a link to book a 15-minute Google Meet demo — I'll share my screen and walk you through the whole thing live.",
        ],
      },
    ],
    objections: [
      {
        obj: "Nobody's going to pay $5,000 for a newspaper sponsorship.",
        response: "I hear you — and if you're thinking about traditional newspaper ads, you're right, nobody pays that. But this isn't an ad. This is EXCLUSIVE category ownership. The sponsor's brand wraps every article in their section for a full year. No competitors. Unlimited branded content. That's a media partnership, not an ad buy. We're already selling these in other markets.",
      },
      {
        obj: "We already sell advertising.",
        response: "Perfect — then you already have relationships with local businesses. This is an upsell on top of what you do. Instead of selling a $200 banner ad that gets ignored, you offer exclusive category ownership for $2,500-5,000. It's a completely different conversation with your advertisers — and a much bigger check.",
      },
      {
        obj: "How do I know the AI content is any good?",
        response: "Go look at wnctimes.com right now — that's our flagship paper in City, ST. It's live, it's indexed on Google News, and the content is professional. You'd have the same quality for [CITY]. And you can always add your own stories on top of what the AI generates — it's additive, not a replacement for your voice.",
      },
      {
        obj: "What happens to my existing website?",
        response: "You can keep it or migrate — your choice. A lot of papers run both during a transition. But once you see the modern platform with AI content, Google News indexing, and the sponsor system built in, most people realize there's no reason to maintain the old site. We can even help redirect your existing traffic.",
      },
    ],
    active: true,
    stats: { calls: 0, interested: 0, closed: 0 },
  },
  {
    id: "np-script-f",
    name: "The Network Play",
    tag: "F",
    description: "For established papers with existing audiences. Position AIOS as a technology upgrade and network opportunity. Emphasize being part of something bigger — a national network of community papers.",
    sections: [
      {
        heading: "Opening (respect + recognition — they've built something real)",
        lines: [
          "Hi, this is Carl Farrington. I've been in web development for 30 years and I run a community news platform called ContentStudio. I've been following [THEIR PAPER] and I'm impressed with what you've built in [CITY]. Do you have a few minutes?",
        ],
      },
      {
        heading: "Hook (network vision — they're not alone anymore)",
        lines: [
          "I'm reaching out because we're building something I think you'll want to be part of. We're assembling a network of community newspapers across the country — independent papers, each with their own brand and editorial voice, but all powered by the same AI infrastructure that the major publishers use.",
          "Think of it like a franchise model for community journalism. You keep everything that makes [THEIR PAPER] unique. We provide the technology that makes it sustainable.",
        ],
      },
      {
        heading: "The Pitch (partnership framing — equals working together)",
        lines: [
          "Here's what the platform gives you. AI-powered content generation that keeps your paper publishing consistently — local news, sports, business, events. A modern website that's mobile-first and indexed on Google News. Built-in SEO that gets your stories found when people search for news in [CITY].",
          "But here's what the NETWORK gives you. Cross-promotion across markets. Shared best practices with other community publishers. A sponsor system that local businesses already understand because it's consistent across the network. And credibility — you're not just a local blog, you're part of a national community news network.",
          "We already have papers operating in City, STlanta, Seattle, and a dozen other markets. We're looking for the right partner in [CITY/STATE], and [THEIR PAPER] is exactly the kind of operation we want in the network.",
        ],
      },
      {
        heading: "The Close (invitation, not a sale)",
        lines: [
          "I'd love to get you set up on the platform so you can kick the tires. It's free to start — you'll have a live version of your paper running in 24 hours. If it's a fit, great. If not, no harm done.",
          "Can I send you the link to get started? I'll also include a Google Meet scheduling link — pick a time that works for you this week and I'll walk you through what some of our other papers are doing. I think you'd find it valuable regardless.",
        ],
      },
    ],
    objections: [
      {
        obj: "I don't want to lose my independence / editorial control.",
        response: "You won't — that's fundamental to how this works. Your brand, your editorial voice, your market. We don't touch your content decisions. The platform is infrastructure, not editorial oversight. Think of us like Shopify for newspapers — we provide the tools, you run the business.",
      },
      {
        obj: "I've seen other 'network' plays and they always fail.",
        response: "I hear you, and most of them failed because they tried to centralize editorial control or relied on venture capital that dried up. We're different — we're bootstrapped, profitable from day one through sponsor revenue, and completely decentralized editorially. Each paper is an independent business. The network is just shared technology and cross-promotion. No one's telling you what to publish.",
      },
      {
        obj: "What's the cost?",
        response: "Free to start, and the platform subscription is designed to be covered by the sponsor revenue system. Six sponsors at $2,500-5,000 each puts $15,000-17,000 in your pocket annually. The platform pays for itself and then some. We make money when you make money.",
      },
      {
        obj: "How many papers are actually in the network?",
        response: "We're operating in 17 markets right now, with papers in City, STlanta, Chicago, Miami, Seattle, and more. Some are run by local operators, some we run ourselves to prove the model. We're actively expanding and [CITY/STATE] is a market we're focused on. That's why I'm calling you — I'd rather partner with an established paper than start from scratch.",
      },
    ],
    active: true,
    stats: { calls: 0, interested: 0, closed: 0 },
  },
];

export const TDA_SCRIPTS = [
  {
    id: "tda-script-g",
    name: "The Tourism Platform Play",
    tag: "G",
    description: "Position ContentStudio as a tourism amplifier. State TDAs need digital reach — show them how a network of local news sites drives organic tourism coverage they can't get from traditional media buys.",
    sections: [
      {
        heading: "Opening (professional, government-appropriate tone)",
        lines: [
          "Hi, this is Carl Farrington with ContentStudio. I'm reaching out to your tourism office — who handles digital partnerships or media relations for tourism promotion?",
          "[If gatekeeper: 'I run a network of community news platforms across the country, and I have a partnership opportunity specifically for state tourism offices. Who would be the right person to discuss that with?']",
        ],
      },
      {
        heading: "Hook (data-driven, ROI-focused — speak their language)",
        lines: [
          "We operate a network of AI-powered community newspapers across 17 markets in the US. Each one covers local events, attractions, outdoor recreation, and tourism-related stories — exactly the kind of organic content that drives travel decisions.",
          "I'm reaching out because we're building state-level tourism partnerships, and [STATE] is a priority market for us.",
        ],
      },
      {
        heading: "The Pitch (partnership framing — not a sales pitch, a distribution channel)",
        lines: [
          "Here's what I'm proposing: a content partnership where your tourism office provides us with events, attractions, seasonal campaigns, and travel stories — and we publish them across our network of local news sites with full SEO optimization and Google News indexing.",
          "Your content gets distributed as real news articles, not ads. Readers trust editorial content 5x more than paid placements. And because our sites are indexed on Google News, your tourism stories show up in organic search results — something a banner ad on a travel site can never do.",
          "We can feature [STATE]'s destinations, events, and campaigns as sponsored content sections — giving your office a permanent editorial presence on every paper in our network that's relevant to your tourism goals.",
          "Our flagship, WNC Times in City, ST already doing this organically with Buncombe County TDA content. I'd love to scale that to the state level.",
        ],
      },
      {
        heading: "The Close (government procurement-friendly — low commitment entry)",
        lines: [
          "I know state offices have procurement processes, so I'm not asking for a purchase order today. What I'd like to do is set up a 20-minute call with whoever handles your digital marketing or media partnerships — I can show you exactly what the platform looks like and how the content would appear.",
          "We can start with a pilot — a few pieces of content published across our [STATE]-relevant markets — so you can see the reach and engagement before any formal commitment.",
          "Would next week work for a brief call? I can send over a one-pager in advance so your team can review it.",
        ],
      },
    ],
    objections: [
      {
        obj: "We already have an agency handling our digital marketing.",
        response: "That's great — this isn't meant to replace your agency. Think of it as an additional distribution channel. Your agency creates campaigns; we give those campaigns organic editorial placement in local news markets. Most agencies love it because it extends their reach without extra work on their end.",
      },
      {
        obj: "We don't have budget for new media partnerships.",
        response: "I understand — that's why I'm suggesting we start with a content exchange. You share your events and tourism stories, we publish them as editorial content. No cost. If the results justify it, we can talk about a formal partnership later. The pilot is free.",
      },
      {
        obj: "How is this different from a press release service?",
        response: "Press releases go to journalists who may or may not cover them. Our platform publishes your content directly as full articles on local news sites that are indexed on Google News. You get guaranteed placement, not a maybe. And the content lives permanently on the site, building SEO value over time — a press release disappears in 24 hours.",
      },
      {
        obj: "We need to go through a formal RFP process.",
        response: "Completely understand — we work with government offices and we're familiar with procurement requirements. I can provide everything you'd need for an RFP response. But let's start with the pilot so your team can evaluate the results and build the internal case. No RFP needed for a free content partnership.",
      },
      {
        obj: "What markets do you actually cover in our state?",
        response: "Right now we're in 17 markets nationally, and we're actively expanding. For [STATE], I can tell you exactly which markets we serve and which ones we're launching next. Even if we don't have a paper in [CITY] yet, our content gets Google News distribution statewide. And if there's demand, we can launch a market specifically to support your tourism goals.",
      },
    ],
    active: true,
    stats: { calls: 0, interested: 0, closed: 0 },
  },
  {
    id: "tda-script-h",
    name: "The Data & Reach Play",
    tag: "H",
    description: "Lead with metrics and reach data. For TDAs that are data-driven and need to justify spend. Focus on impressions, Google News indexing, and measurable tourism content distribution.",
    sections: [
      {
        heading: "Opening (direct, metrics-forward)",
        lines: [
          "Hi, this is Carl Farrington. I run ContentStudio — a network of local news platforms across 17 US markets. I'm calling about a tourism content distribution opportunity for [STATE]. Who handles your digital strategy or media buying?",
        ],
      },
      {
        heading: "Hook (numbers first — government people love data)",
        lines: [
          "Quick context: our newspaper network reaches readers across markets from City, ST to Seattle, all indexed on Google News. We're seeing strong organic engagement on tourism and events content — and we want to formalize that with state tourism offices.",
          "I have a simple question: is your office looking for new ways to get [STATE] tourism content in front of in-market travelers through organic news channels?",
        ],
      },
      {
        heading: "The Pitch (measurable outcomes)",
        lines: [
          "Here's the model: we publish tourism content — your events, destinations, seasonal campaigns — as editorial features across our network. Each article is fully SEO-optimized, Google News indexed, and lives permanently on the site.",
          "That means every piece of content we publish for [STATE] is a long-tail SEO asset. Someone Googling 'things to do in [STATE CITY]' six months from now finds your tourism story on a trusted local news source — not a paid ad they'll skip.",
          "We track impressions, click-throughs, and engagement on every article. You get a monthly report showing exactly what your content partnership delivered. Real numbers, not vanity metrics.",
        ],
      },
      {
        heading: "The Close (pilot offer)",
        lines: [
          "I'd like to run a 90-day pilot: we publish 10-12 tourism articles for [STATE] across our relevant markets, and I send you a full performance report at the end. Zero cost for the pilot.",
          "If the numbers work, we formalize the partnership. If they don't, you got free distribution. Either way, it's a no-risk way to test a new channel.",
          "Can I set up a 15-minute call to walk through the specifics?",
        ],
      },
    ],
    objections: [
      {
        obj: "We measure ROI on everything — how would we track this?",
        response: "We provide full analytics: article impressions, unique visitors, time on page, click-through to your tourism site via embedded links, and Google Search Console data showing keyword rankings. We can also set up UTM parameters so your team can track conversions in your own analytics. Complete transparency.",
      },
      {
        obj: "Our tourism season is coming up — we can't onboard something new right now.",
        response: "Actually, that's the perfect time. A pilot during peak season gives you the best data. And there's no onboarding burden on your end — just send us your existing content, press releases, or event listings. We handle everything: writing, publishing, SEO, distribution. Your team's workload is literally one email.",
      },
      {
        obj: "We focus on out-of-state visitors, not local news readers.",
        response: "Our sites are Google News indexed, which means the content reaches anyone searching for travel information about your state — not just local readers. Someone in Chicago planning a trip to [STATE] will find our article in their Google results. That's the power of SEO-optimized editorial content versus local readership.",
      },
    ],
    active: true,
    stats: { calls: 0, interested: 0, closed: 0 },
  },
];

export const DEV_SCRIPTS = [
  {
    id: "dev-script-a",
    name: "Cold Outreach — Local Business Web/App",
    tag: "A",
    description: "Cold outbound to small/medium local businesses. Leads with a specific observation about their current web presence, positions Farrington Development as the local AI-native alternative to agencies and freelancers.",
    sections: [
      {
        heading: "Opening (quick, specific, not a pitch)",
        lines: [
          "Hi, this is Carl Farrington with Farrington Development here in City, ST — is this [FIRST NAME]?",
          "I'll be quick — I was looking at [BUSINESS NAME]'s website this morning and noticed [SPECIFIC OBSERVATION: e.g., 'it's not mobile-friendly' / 'no booking flow' / 'last updated in 2019']. Can I take 60 seconds to tell you why I'm calling?",
        ],
      },
      {
        heading: "Hook (credibility + differentiator)",
        lines: [
          "We build websites, web apps, and internal tools for local businesses — the difference is we use AI the way the big tech companies use it, which means we deliver in days what agencies quote in months, and at a fraction of the price.",
          "We've built [EXAMPLE: newsroom platforms, CRMs, booking systems] for businesses in WNC. Everything we build is owned by you — no monthly hostage fees, no weird lock-in.",
        ],
      },
      {
        heading: "Discovery (get them talking — don't pitch yet)",
        lines: [
          "Before I say another word — what's the one thing about your current website or tech setup that actually bugs you? The thing you've been meaning to fix but keep pushing off?",
          "[LISTEN. Take notes. Mirror back what they say.]",
          "And if that got fixed — what would it actually change for you? More bookings? Fewer phone calls? Staff not re-typing things?",
        ],
      },
      {
        heading: "The Offer (value-anchored, not feature-listed)",
        lines: [
          "Here's what I'd suggest: give me 30 minutes — no commitment, no slide deck — and I'll walk you through exactly what I'd build to fix [THEIR PAIN POINT], what it'd cost, and how fast. If it makes sense, great. If not, you've got a second opinion for free.",
          "Worst case: you walk away knowing more about your options than you did this morning.",
        ],
      },
      {
        heading: "Close (pick a time, don't 'send info')",
        lines: [
          "I've got Thursday at 10, or Friday at 2 — which works better? I'll send a calendar invite and a short form so I come in prepared instead of wasting your time.",
        ],
      },
    ],
    objections: [
      {
        obj: "We already have a web person / agency.",
        response: "Totally understand — and I'm not asking you to fire anyone. Most of what we do is stuff agencies can't or won't touch: custom internal tools, AI integrations, automating the repetitive stuff that eats your staff's time. Worth a 20-minute look to see if there's a gap we could fill?",
      },
      {
        obj: "We're not looking right now.",
        response: "Fair. Quick question — if I showed you something that paid for itself in 60 days, would that change your timeline? Because that's usually what we build. Even if this year is a no, I'd love to be the first call you make when the timing's right.",
      },
      {
        obj: "How much does this cost?",
        response: "Honest answer: depends entirely on scope — but we work hourly at $150 and most projects land between $2,500 and $15,000. Compare that to an agency quote of $30K+ for the same thing. The 30-minute call is where I scope it for you so you get a real number, not a guess.",
      },
      {
        obj: "Can you send me information first?",
        response: "I can, and I will — but the info I'd send is generic. The 30-minute call is where we talk about YOUR situation, which is what makes it useful. I'll send a one-pager AND book the call — if it's a no after we talk, no hard feelings.",
      },
      {
        obj: "AI is just a buzzword / I don't trust it.",
        response: "Same — most 'AI' marketing is garbage. What we actually do is use AI like a carpenter uses a nail gun. Output is still built and QA'd by humans. You don't have to understand it, you just see the result: faster delivery, lower cost, and stuff that works.",
      },
    ],
    active: true,
    stats: { calls: 0, interested: 0, closed: 0 },
  },
  {
    id: "dev-script-b",
    name: "Inbound / Referral Follow-Up",
    tag: "B",
    description: "First call to someone who filled out a form, DM'd, or was referred. Warmer than cold — skip the credibility dance, go straight to discovery.",
    sections: [
      {
        heading: "Opening",
        lines: [
          "Hey [FIRST NAME], Carl Farrington — you reached out about [PROJECT TYPE]. Thanks for that. Got a few minutes to talk through it?",
          "[If referred: '[REFERRER] mentioned you might be looking at [PROJECT TYPE]. Figured I'd call rather than email — easier.']",
        ],
      },
      {
        heading: "Discovery (most of the call lives here)",
        lines: [
          "Walk me through what you're trying to do. What's the problem you're actually trying to solve?",
          "Who else is involved in this decision?",
          "Have you tried anything else to solve it? What happened?",
          "If we built exactly the right thing — what would success look like 90 days after launch?",
          "What's your rough budget range? (If they won't say: 'are we talking a few thousand, or tens of thousands?')",
          "When does this need to be live, and what's driving that date?",
        ],
      },
      {
        heading: "Qualification (MAN gate)",
        lines: [
          "Money — do they have budget or can get it fast?",
          "Authority — are they the decision-maker, or do we need someone else on the next call?",
          "Need — is this a 'nice to have' or a real business problem costing them real money?",
        ],
      },
      {
        heading: "Next Step",
        lines: [
          "Based on what you've told me, I can put together a scope + estimate. I'll send it in 48 hours along with 2-3 examples of similar work. Then we jump on a 30-minute call to walk through it. Sound good?",
          "Before we hang up — anything you forgot to mention, or anything you're worried about with a project like this?",
        ],
      },
    ],
    objections: [
      {
        obj: "We're also talking to [COMPETITOR].",
        response: "Smart — you should be. Couple of things to ask them: do you own the code at the end? Do I get source access? What's the ongoing cost after launch? Those answers usually reveal who's actually aligned with your interests.",
      },
      {
        obj: "I'm just gathering info right now.",
        response: "Perfect — that's exactly when a scope call is most useful. You get a real number to compare against, and I'm not going to chase you. I'll send the scope, you sit with it, and come back when you're ready.",
      },
      {
        obj: "Can you just give me a ballpark over the phone?",
        response: "I can — and I'll caveat that it's a guess until I understand more. Most projects land between $2.5K and $15K. A 20-minute conversation usually saves you $5K in scope creep later. Worth 20 minutes?",
      },
    ],
    active: true,
    stats: { calls: 0, interested: 0, closed: 0 },
  },
];

export const CAMPAIGN_SCRIPTS = [
  {
    id: 'campaign-digital-audit',
    name: 'Campaign digital readiness',
    tag: 'A',
    description: 'Manual committee outreach. Party-neutral discovery for web, video, rapid-response content, CRM, and consent-based voter-contact workflows.',
    sections: [
      { heading: 'Opening', lines: [
        'Hi, this is Carl Farrington with Farrington Development. May I speak with the campaign manager or treasurer?',
        'I am calling the committee directly from its public filing—not any contributor list—and I will keep this brief.',
      ] },
      { heading: 'Campaign window', lines: [
        'I help campaigns tighten their website, video, rapid-response content, CRM, and call handling when the calendar gets compressed.',
        'Where is the biggest bottleneck today: publishing quickly, turning interest into volunteers or donors, or keeping follow-up organized?',
      ] },
      { heading: 'Qualification', lines: [
        'Is there an approved digital or operations budget for this election window?',
        'Who owns the decision and how quickly would a useful fix need to be live?',
        'Would a short screen-share audit of the campaign workflow be useful this week?',
      ] },
      { heading: 'Compliance close', lines: [
        'This is a manual business call. We do not use contributor data or target outreach by party.',
        'Any automated or AI-voice work would remain off until the committee records prior express consent.',
      ] },
    ],
    objections: [
      { obj: 'We already have a consultant.', response: 'That makes sense. I can focus narrowly on the implementation gaps your consultant identifies—site speed, integrations, rapid-response production, or CRM follow-up—without replacing strategy.' },
      { obj: 'Send information.', response: 'I can send a one-page, party-neutral capabilities note. What committee email should receive it, and who should I address it to?' },
    ],
    active: true,
    stats: { calls: 0, interested: 0, closed: 0 },
  },
]
