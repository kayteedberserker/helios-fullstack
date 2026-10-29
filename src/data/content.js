import { defaultPlans } from '../../shared/catalog.js';
// Edit the site's copy and repeated content here. Keep IDs unique and stable.
// All names, quotes, plans and product capabilities below are sample content.
export const site = {
    name: 'Helios',
    tagline: 'A little less to think about.',
    hero: { lead: 'Big day?', emphasis: 'Small text.', description: 'Meet your own AI agent. A little help with plans, drafts, ideas, and the next good step. All in one calm workspace.', cta: 'Find my agent', note: 'Your own agent. One calm workspace.' },
    footer: 'More living. Less juggling.',
};

export const navLinks = [
    { id: 'product', label: 'Product' },
    { id: 'use-cases', label: 'Use cases' },
    { id: 'integrations', label: 'Integrations' },
    { id: 'customers', label: 'Customers' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'faq', label: 'FAQ' },
];

export const looseEnds = [
    { id: 'email', app: 'Gmail', text: 'Your flight check-in is open', icon: 'Mail', color: 'red' },
    { id: 'chat', app: 'WhatsApp', text: 'Are we still on for Friday?', icon: 'MessageCircle', color: 'green' },
    { id: 'meeting', app: 'Calendar', text: 'Team catch-up · Tomorrow, 10am', icon: 'CalendarDays', color: 'blue' },
    { id: 'work', app: 'Slack', text: 'Can you send the final deck?', icon: 'Hash', color: 'purple' },
];

export const conversations = [
    {
        id: 'day', label: 'My day', icon: 'Sun', title: 'Your day, untangled.', subtitle: 'The right details. At the right time.', messages: [
            { id: 'day-1', from: 'user', text: 'Morning! What do I need to know today?' },
            { id: 'day-2', from: 'assistant', text: 'Morning ☀️ A few things worth keeping on your radar:' },
            { id: 'day-3', from: 'assistant', text: 'Share your meetings, tasks, and travel plans, and we can turn them into a simple outline like this:', items: ['10:00 · Team catch-up', '12:00 · Send Maya the proposal', '17:30 · Train to Manchester'] },
            { id: 'day-4', from: 'user', text: 'Remind me about the proposal at 11?' },
            { id: 'day-5', from: 'assistant', text: 'Add an 11am reminder to your calendar. Here’s a short reminder title: Review and send the proposal.' },
        ]
    },
    {
        id: 'trip', label: 'A trip', icon: 'Plane', title: 'Less planning. More going.', subtitle: 'Bring the scattered details together.', messages: [
            { id: 'trip-1', from: 'user', text: 'Help me plan a weekend in Lisbon.' },
            { id: 'trip-2', from: 'assistant', text: 'Of course. A relaxed weekend or a see-everything adventure?' },
            { id: 'trip-3', from: 'user', text: 'Good food, long walks, no rushing.' },
            { id: 'trip-4', from: 'assistant', text: 'Sounds like your kind of weekend. Here’s a starting point:', items: ['Friday · Arrive and dinner in Alfama', 'Saturday · Coffee, coast, and a sunset walk', 'Sunday · A slow morning before heading home'] },
            { id: 'trip-5', from: 'assistant', text: 'Want me to look at places to stay next?' },
        ]
    },
    {
        id: 'work', label: 'My work', icon: 'BriefcaseBusiness', title: 'Keep the good work moving.', subtitle: 'A clear next step in a busy week.', messages: [
            { id: 'work-1', from: 'user', text: 'What came out of the launch meeting?' },
            { id: 'work-2', from: 'assistant', text: 'Three decisions, and three things to do next.', items: ['Maya · Finalise the launch copy', 'You · Review the pricing page', 'Alex · Share the customer shortlist'] },
            { id: 'work-3', from: 'user', text: 'Can you draft a quick follow-up?' },
            { id: 'work-4', from: 'assistant', text: 'Here’s a draft: “Thanks everyone! We’re aiming for Friday. Maya owns copy, I’ll review pricing, and Alex will share the shortlist.”' },
            { id: 'work-5', from: 'assistant', text: 'Have a look and make it yours before sending.' },
        ]
    },
];

export const useCases = [
    { id: 'plan', icon: 'Plane', title: 'Make the trip happen', description: 'Turn “we should go somewhere” into a weekend with a plan.', prompt: 'A weekend in Lisbon?', reply: 'Let’s make it a good one.', apps: ['Planning', 'Drafting'], demo: 'trip' },
    { id: 'follow', icon: 'MessageCircle', title: 'Keep the conversation going', description: 'Turn the context you share into thoughtful replies and clear follow-ups.', prompt: 'Help me follow up with Maya.', reply: 'Of course. Share a little context.', apps: ['Writing', 'Follow-ups'], demo: 'work' },
    { id: 'remember', icon: 'Gift', title: 'Make room for the little things', description: 'Turn birthdays, bookings, and good intentions into plans you can follow.', prompt: 'Mum’s birthday is next week.', reply: 'Let’s brainstorm a thoughtful gift.', apps: ['Ideas', 'Planning'], demo: 'day' },
    { id: 'inbox', icon: 'Mail', title: 'Find what actually matters', description: 'Share the messages that need your attention and find a clear next step.', prompt: 'Which of these tasks is urgent?', reply: 'Let’s sort them by deadline and impact.', apps: ['Prioritising', 'Drafting'], demo: 'day' },
    { id: 'move', icon: 'BriefcaseBusiness', title: 'Move work forward', description: 'Pull the next steps out of a meeting and keep everyone in the loop.', prompt: 'Catch me up on the launch.', reply: 'Three decisions. Three next steps.', apps: ['Projects', 'Plans'], demo: 'work' },
    { id: 'catch', icon: 'Sun', title: 'Start with a clearer head', description: 'Share what is on your plate and shape a practical plan for the day.', prompt: 'What’s on my plate?', reply: 'Your day, in one small message.', apps: ['Planning', 'Focus'], demo: 'day' },
];

export const integrations = [
    { id: 'whatsapp', name: 'WhatsApp', icon: 'MessageCircle', color: 'green', category: 'Conversations' },
    { id: 'gmail', name: 'Gmail', icon: 'Mail', color: 'red', category: 'Email' },
    { id: 'calendar', name: 'Calendar', icon: 'CalendarDays', color: 'blue', category: 'Your schedule' },
    { id: 'slack', name: 'Slack', icon: 'Hash', color: 'purple', category: 'Your team' },
    { id: 'notion', name: 'Notion', icon: 'FileText', color: 'ink', category: 'Notes & ideas' },
    { id: 'drive', name: 'Drive', icon: 'FolderOpen', color: 'gold', category: 'Your files' },
    { id: 'outlook', name: 'Outlook', icon: 'Inbox', color: 'blue', category: 'Email' },
    { id: 'messages', name: 'Messages', icon: 'MessagesSquare', color: 'green', category: 'Conversations' },
];

export const customers = [
    { id: 'tunde', name: 'Tunde Adebayo', role: 'Founder, many hats', initials: 'MT', color: 'blue', quote: 'My favourite part is the morning catch-up. A handful of things that matter, instead of opening six different apps.' },
    { id: 'rasheed', name: 'Abdurrasheed Abdullah', role: 'Designer, always making', initials: 'DC', color: 'gold', quote: 'I can finally stop using my brain as a to-do list. The little reminders give me room to focus on the work I love.' },
    { id: 'amara', name: 'Amara Okafor', role: 'Busy days, big plans', initials: 'AO', color: 'purple', quote: 'Travel plans, family plans, work plans. Having everything in one conversation just makes my week feel lighter.' },
];

export const plans = defaultPlans.map(plan => ({ ...plan, id: plan.code, monthly: plan.monthlyPrice / 100, yearly: plan.yearlyPrice / 100, tagline: plan.description }));

export const faqs = [
    { id: 'what', question: 'What is Helios?', answer: 'Helios is a personal workspace for your own AI agent. Choose a speciality, give it a name, and ask for help with plans, drafts, writing, and everyday ideas.' },
    { id: 'start', question: 'How do I get started?', answer: 'Create an account, choose an agent speciality, and tell it a little about the help you need. You can customise its name, instructions, and tone later.' },
    { id: 'free', question: 'Is there a free plan?', answer: 'Yes. Free includes one personal agent and 50 AI responses each calendar month. Pro and Max offer larger response allowances. Limits reset on the first day of each month, UTC.' },
    { id: 'apps', question: 'Can I connect my other apps?', answer: 'App connections are on the roadmap. This first release works inside your Helios dashboard and does not connect to Gmail, WhatsApp, Slack, or other external apps.' },
    { id: 'approval', question: 'Will it do things without asking me?', answer: 'Your agent provides suggestions, plans, and drafts for you to review. It cannot send emails, make bookings, or perform actions in other apps in this release.' },
    { id: 'payments', question: 'How do paid plans work?', answer: 'Pay for 30 or 365 days of access in USD through Paystack. Access renews manually, with no automatic charges. Renewing the same plan extends your access; switching plans starts a new access period immediately.' },
];
