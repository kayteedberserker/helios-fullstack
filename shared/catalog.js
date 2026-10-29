// Editable starting content. The seed command copies this into MongoDB.
export const defaultPlans = [
    { code: 'free', name: 'Free', description: 'A little help to get you started.', monthlyPrice: 0, yearlyPrice: 0, responseLimit: 50, features: ['One personal AI agent', '50 responses per calendar month', 'Agent customisation', 'Saved conversations'] },
    { code: 'pro', name: 'Pro', description: 'More room for your everyday work.', monthlyPrice: 2500, yearlyPrice: 25000, responseLimit: 1000, features: ['One personal AI agent', '1,000 responses per calendar month', 'All agent specialities', 'Saved conversations'], featured: true },
    { code: 'max', name: 'Max', description: 'For your most ambitious days.', monthlyPrice: 10000, yearlyPrice: 100000, responseLimit: 5000, features: ['One personal AI agent', '5,000 responses per calendar month', 'All agent specialities', 'Saved conversations'] },
]

export const defaultTemplates = [
    { key: 'everyday', name: 'Everyday assistant', category: 'Personal', icon: 'Sparkles', color: 'blue', description: 'A clear head for busy days. Plan, organise, and turn scattered thoughts into next steps.', features: ['Daily planning', 'Helpful drafts', 'Ideas & decisions'], prompts: ['Help me plan a productive week.', 'Turn my notes into a clear action plan.', 'Help me prioritise my tasks.'] },
    { key: 'content', name: 'Content companion', category: 'Creative', icon: 'PenLine', color: 'purple', description: 'Find your words. Shape ideas into thoughtful posts, emails, and stories in your voice.', features: ['Content ideas', 'Writing & editing', 'Campaign planning'], prompts: ['Plan a week of content for my business.', 'Help me write a friendly welcome email.', 'Make this draft clearer and more concise.'] },
    { key: 'business', name: 'Business copilot', category: 'Business', icon: 'BriefcaseBusiness', color: 'gold', description: 'Move good work forward with practical research plans, proposals, and customer replies.', features: ['Proposal drafts', 'Customer replies', 'Business planning'], prompts: ['Help me outline a proposal for a new client.', 'Draft a thoughtful response to a customer.', 'Build a simple launch checklist.'] },
]
