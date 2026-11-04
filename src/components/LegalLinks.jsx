import { Link } from 'react-router-dom';

export default function LegalLinks() {
  return <nav className="nooky-legal-links" aria-label="Legal information"><Link to="/privacy">Privacy Policy</Link><Link to="/terms">Terms of Service</Link></nav>;
}
