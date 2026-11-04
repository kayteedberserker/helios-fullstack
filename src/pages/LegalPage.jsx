import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Brand } from '../components/ui.jsx';
import LegalLinks from '../components/LegalLinks.jsx';
import { legalDocuments, legalUpdated } from '../../shared/legal.js';

export default function LegalPage({ kind }) {
  const document = legalDocuments[kind];
  const email = (import.meta.env.VITE_SUPPORT_EMAIL || '').trim();
  const operator = (import.meta.env.VITE_LEGAL_ENTITY || 'Nooky').trim();
  useEffect(() => { window.document.title = `${document.title} · Nooky`; }, [document.title]);
  return <div className="nooky-legal"><a className="skip-link" href="#legal-content">Skip to content</a><header><Brand /><Link to="/">Back to Nooky</Link></header><main id="legal-content"><div className="nooky-legal-intro"><p>NOOKY · LEGAL</p><h1>{document.title}</h1><p>{document.description}</p><small>Last updated: {legalUpdated}</small></div><nav className="nooky-legal-toc" aria-label="On this page">{document.sections.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}<a href="#contact">Contact</a></nav><article>{document.sections.map(section => <section key={section.id} id={section.id}><h2>{section.title}</h2>{section.paragraphs.map((paragraph, i) => <p key={i}>{paragraph}</p>)}</section>)}<section id="contact"><h2>Contact</h2><p>Service operator: {operator}.</p>{email ? <p>For support, privacy requests or questions about these terms, email <a href={`mailto:${email}`}>{email}</a>.</p> : <p>Use Contact us in your signed-in workspace, or the developer support contact shown on the Google consent screen, to reach the Nooky team.</p>}<p>You can also read our <Link to={kind === 'privacy' ? '/terms' : '/privacy'}>{kind === 'privacy' ? 'Terms of Service' : 'Privacy Policy'}</Link>.</p></section></article></main><footer><span>© {new Date().getFullYear()} Nooky</span><LegalLinks /></footer></div>;
}
