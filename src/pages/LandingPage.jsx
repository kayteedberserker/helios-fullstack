import { useEffect, useState } from 'react';
import { MessageCircle, MessagesSquare, Mail, CalendarDays, Hash, FileText, FolderOpen, Inbox, Sun, Plane, BriefcaseBusiness, Gift, Menu, X, Plus, Check, ShieldCheck, Sparkles, ChevronDown } from 'lucide-react';
import { site, navLinks, looseEnds, conversations, useCases, integrations, customers, plans, faqs } from '../data/content.js';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext.jsx';
import { useResource } from '../lib/useResource.js';
import PageMotion from '../components/PageMotion.jsx';

const icons = { MessageCircle, MessagesSquare, Mail, CalendarDays, Hash, FileText, FolderOpen, Inbox, Sun, Plane, BriefcaseBusiness, Gift };
function Icon({ name, ...props }) { const Component = icons[name] || MessageCircle; return <Component aria-hidden="true" {...props} />; }
function Brand({ light = false }) { return <a className={`brand ${light ? 'brand-light' : ''}`} href="#top" aria-label={`${site.name} home`}><span className="brand-mark" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <span key={i} style={{ '--i': i }} />)}</span>{site.name}<span className="brand-period">.</span></a>; }
function ButtonLink({ children, href = '/signup', className = '', ...props }) { return <Link className={`button ${className}`} to={href} {...props}>{children}</Link>; }
function SectionHeading({ eyebrow, title, description, centered = false }) { return <div className={`section-heading ${centered ? 'centered' : ''}`}><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{description && <p className="section-description">{description}</p>}</div>; }

function Header() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState('');
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) setActive(entry.target.id); });
    }, { rootMargin: '-20% 0px -60% 0px', threshold: 0 });
    navLinks.forEach(link => { const section = document.getElementById(link.id); if (section) observer.observe(section); });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = event => { if (event.key === 'Escape') { setMenuOpen(false); document.getElementById('menu-toggle')?.focus(); } };
    const closeOnWideScreen = () => { if (window.innerWidth > 1000) setMenuOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', closeOnWideScreen);
    return () => { document.removeEventListener('keydown', closeOnEscape); window.removeEventListener('resize', closeOnWideScreen); };
  }, [menuOpen]);
  return <header className="header"><div className="header-inner">
    <Brand />
    <nav id="main-nav" aria-label="Main navigation" className={`nav ${menuOpen ? 'nav-open' : ''}`}>
      {navLinks.map(link => <a key={link.id} href={`#${link.id}`} aria-current={active === link.id ? 'location' : undefined} onClick={() => setMenuOpen(false)}>{link.label}</a>)}
    </nav>
    <Link className="header-login" to={user ? user.role === 'admin' ? '/admin/dashboard' : '/app/dashboard' : '/login'}>{user ? 'My workspace' : 'Sign in'}</Link>
    <ButtonLink className="header-cta"><MessageCircle size={16} aria-hidden="true" />{site.hero.cta}</ButtonLink>
    <button id="menu-toggle" className="menu-toggle" aria-controls="main-nav" aria-expanded={menuOpen} aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
  </div></header>;
}

function Hero() {
  return <section id="top" className="hero"><div className="container hero-inner">
    <p className="hero-kicker"><span className="mini-mark"><Sparkles size={15} aria-hidden="true" /></span>{site.tagline}</p>
    <h1>{site.hero.lead}<br /><span>{site.hero.emphasis}</span></h1>
    <p className="hero-description">{site.hero.description}</p>
    <ButtonLink className="hero-button"><MessageCircle size={19} aria-hidden="true" />{site.hero.cta}</ButtonLink>
    <p className="hero-note">{site.hero.note}</p>
    <a className="explore-link" href="#what-it-does">A lighter day starts here <ChevronDown size={15} aria-hidden="true" /></a>
  </div></section>;
}

function LooseEnds() {
  return <section id="what-it-does" className="loose-section"><div className="container loose-layout">
    <SectionHeading eyebrow="Sound familiar?" title={<>A dozen tabs.<br />One busy brain.</>} description="The plans are in your messages. The details are in your inbox. And somehow, you’re the one holding it all together." />
    <div className="notification-field" style={{ '--card-count': looseEnds.length, '--field-height': `${510 + Math.max(0, Math.ceil(looseEnds.length / 4) - 1) * 150}px` }}>{looseEnds.map((item, i) => <div key={item.id} className="thread-notification" style={{ '--card-index': i, '--card-x': `${[15, 47, 81, 56][i % 4]}%`, '--card-y': `${[100, 220, 120, 380][i % 4] + Math.floor(i / 4) * 150}px` }}><div className="loose-card"><span className={`app-icon ${item.color}`}><Icon name={item.icon} size={21} /></span><div><span className="app-label">{item.app}</span><p>{item.text}</p></div><span className="notification-time">now</span></div></div>)}</div>
  </div></section>;
}

function Product({ selected, onSelect }) {
  const conversation = conversations.find(item => item.id === selected) || conversations[0];
  return <section id="product" className="product-section section"><div className="container product-layout">
    <div className="product-copy"><SectionHeading eyebrow="Meet your extra pair of hands" title={<>One conversation.<br /><span className="blue-text">A lot less juggling.</span></>} description="Ask a question. Make a plan. Pick up where you left off. Helios brings the details together, so you can get on with your day." />
      <div className="demo-tabs" role="group" aria-label="Choose a conversation example">{conversations.map(item => <button key={item.id} className={selected === item.id ? 'selected' : ''} aria-pressed={selected === item.id} onClick={() => onSelect(item.id)}><Icon name={item.icon} size={16} />{item.label}</button>)}</div>
      <div className="demo-caption" aria-live="polite"><h3>{conversation.title}</h3><p>{conversation.subtitle}</p></div>
      <p className="quiet-note"><ShieldCheck size={16} aria-hidden="true" />Your call, always. Suggestions first, approval next.</p>
    </div>
    <div className="phone-wrap"><span className="phone-label">ONE THREAD. EVERYTHING IN REACH.</span><div className="phone">
      <div className="phone-status"><span>9:41</span><span aria-hidden="true">▮▮▮ · 100%</span></div><div className="phone-top"><span className="assistant-avatar"><Sparkles size={21} aria-hidden="true" /></span><strong>{site.name}</strong><span>Conversation preview</span></div>
      <div className="messages" key={conversation.id}><p className="message-day">Today 9:41 AM</p>{conversation.messages.map((message, i) => <div className={`message ${message.from}`} key={message.id} style={{ '--message-index': i }}><p>{message.text}</p>{message.items && <ul>{message.items.map(item => <li key={item}><Check size={13} aria-hidden="true" />{item}</li>)}</ul>}</div>)}<span className="delivered">Delivered</span></div>
      <div className="phone-input" aria-hidden="true"><Plus size={19} /><span>Message {site.name}</span><span className="input-send">↑</span></div><div className="phone-home" />
    </div><span className="phone-footnote">An example of a little help.</span></div>
  </div></section>;
}

function UseCases({ onSelect }) {
  return <section id="use-cases" className="section use-cases-section"><div className="container">
    <SectionHeading eyebrow="For the things that fill your day" title={<>Life happens.<br />A little help goes a long way.</>} description="From big plans to small reminders. Make room for what you actually want to do." />
    <div className="use-case-grid">{useCases.map(item => <article key={item.id} className="use-case-card"><Icon name={item.icon} className="feature-icon" size={26} /><h3>{item.title}</h3><p>{item.description}</p><div className="mini-conversation"><span>{item.prompt}</span><span>{item.reply}</span></div><div className="case-bottom"><div className="tags">{item.apps.map(app => <span key={app}>{app}</span>)}</div><a href="#product" onClick={() => onSelect(item.demo)} aria-label={`See conversation: ${item.title}`}>See example</a></div></article>)}</div>
  </div></section>;
}

function Integrations() {
  return <section id="integrations" className="section integrations-section"><div className="container">
    <SectionHeading centered eyebrow="Already part of your world" title={<>Your favourite apps.<br />Finally on the same page.</>} description="A glimpse of where Helios can go. App connections are on the roadmap; this first release brings your agent into a personal Helios workspace." />
    <div className="integration-network"><div className="integration-hub" aria-label={`${site.name} connects your apps`}><Sparkles size={28} aria-hidden="true" /><span>{site.name}</span></div><div className="integration-grid">{integrations.map(item => <div className="integration" key={item.id}><span className={`app-icon ${item.color}`}><Icon name={item.icon} size={25} /></span><strong>{item.name}</strong><span>{item.category}</span><span className="integration-planned">Planned connection</span></div>)}</div></div>
    <p className="integration-note"><ShieldCheck size={17} aria-hidden="true" />App connections are planned. Your agent currently works inside Helios.</p>
  </div></section>;
}

function Customers() {
  return <section id="customers" className="section customers-section"><div className="container">
    <SectionHeading eyebrow="A glimpse of a lighter week" title={<>Busy people.<br />Lighter weeks.</>} />
    <p className="landing-preview-note">Illustrative stories — sample content to replace with real customer feedback.</p>
    <div className="customer-grid">{customers.map(customer => <figure key={customer.id} className="customer-card"><span className="quote-mark" aria-hidden="true">“</span><blockquote>{customer.quote}</blockquote><figcaption><span className={`customer-avatar ${customer.color}`}>{customer.initials}</span><div><strong>{customer.name}</strong><span>{customer.role}</span></div></figcaption></figure>)}</div>
  </div></section>;
}

function Pricing() {
  const { user } = useAuth();
  const [billing, setBilling] = useState('monthly');
  const catalog = useResource('/catalog');
  const pricingPlans = catalog.data?.plans.map(plan => ({ ...plan, id: plan.code, monthly: plan.monthlyPrice / 100, yearly: plan.yearlyPrice / 100, tagline: plan.description })) || plans;
  return <section id="pricing" className="section pricing-section"><div className="container">
    <div className="pricing-heading"><SectionHeading eyebrow="A little help. Or a whole lot." title={<>Start small.<br />Make room for more.</>} description="Find the kind of support that fits your day." /><div className="billing-control"><div className="billing-toggle" role="group" aria-label="Billing period"><button aria-pressed={billing === 'monthly'} className={billing === 'monthly' ? 'selected' : ''} onClick={() => setBilling('monthly')}>Monthly</button><button aria-pressed={billing === 'yearly'} className={billing === 'yearly' ? 'selected' : ''} onClick={() => setBilling('yearly')}>Yearly</button></div><span>Choose 30 or 365 days of access. Renew manually.</span></div></div>
    <div className="pricing-grid" aria-live="polite">{pricingPlans.map(plan => <article key={plan.id} className={`plan ${plan.featured ? 'plan-featured' : ''}`}><div className="plan-top"><span className="eyebrow">{plan.name}</span>{plan.featured && <span className="popular-label">The sweet spot</span>}</div><h3>{plan.tagline}</h3><p className="price">${billing === 'monthly' ? plan.monthly : plan.yearly}<span>{plan.monthly > 0 ? billing === 'monthly' ? '/ 30 days' : '/ 365 days' : ' / forever'}</span></p><p className="plan-description">{plan.description}</p><ButtonLink href={`${user?.role === 'user' ? '/app/dashboard' : '/signup'}?plan=${plan.id}&period=${billing}`} className={plan.featured ? '' : 'button-outline'}>Explore {plan.name}</ButtonLink><ul>{plan.features.map(feature => <li key={feature}><Check size={17} aria-hidden="true" />{feature}</li>)}</ul></article>)}</div>
  </div></section>;
}

function Faq() {
  const [openId, setOpenId] = useState(null);
  return <section id="faq" className="section faq-section"><div className="container faq-layout"><SectionHeading eyebrow="Good questions" title={<>The little<br />details.</>} description="A few things you might be wondering." /><div className="faq-list">{faqs.map(item => <div key={item.id} className={`faq-item ${openId === item.id ? 'faq-open' : ''}`}><h3><button id={`faq-button-${item.id}`} aria-expanded={openId === item.id} aria-controls={`faq-answer-${item.id}`} onClick={() => setOpenId(openId === item.id ? null : item.id)}>{item.question}<Plus size={20} aria-hidden="true" /></button></h3><div role="region" id={`faq-answer-${item.id}`} aria-labelledby={`faq-button-${item.id}`} hidden={openId !== item.id}><p>{item.answer}</p></div></div>)}</div></div></section>;
}

function Footer() {
  return <><section className="closing-section"><div className="container"><p className="eyebrow">You have better things to do.</p><h2>{site.footer}</h2><p>Let the little things take up a little less space.</p><ButtonLink className="button-white"><MessageCircle size={19} aria-hidden="true" />{site.hero.cta}</ButtonLink></div></section><footer className="footer"><div className="container"><div className="footer-top"><div><Brand /><p>{site.tagline}</p></div><nav aria-label="Footer navigation">{navLinks.map(link => <a key={link.id} href={`#${link.id}`}>{link.label}</a>)}</nav></div><div className="footer-bottom"><span>© {new Date().getFullYear()} {site.name}. Made for the everyday.</span><a href="#top">Back to top</a></div></div></footer></>;
}

export default function LandingPage() {
  useEffect(() => { document.title = 'Helios — A little less to think about.'; }, []);
  const [selectedDemo, setSelectedDemo] = useState(conversations[0].id);
  return <><a className="skip-link" href="#main">Skip to content</a><Header /><PageMotion><main id="main"><Hero /><LooseEnds /><Product selected={selectedDemo} onSelect={setSelectedDemo} /><UseCases onSelect={setSelectedDemo} /><Integrations /><Customers /><Pricing /><Faq /></main><Footer /></PageMotion></>;
}
