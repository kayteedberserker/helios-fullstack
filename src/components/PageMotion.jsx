import { useEffect, useRef, useState } from 'react';
import { buildThreadGeometry } from './threadGeometry.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function ThreadNetwork({ sceneRef }) {
  const svgRef = useRef(null);
  const [layout, setLayout] = useState({ width: 1, height: 1, paths: [] });

  useEffect(() => {
    const root = sceneRef.current;
    if (!root) return;
    let frame = 0;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const origin = root.getBoundingClientRect();
        const box = element => {
          const r = element.getBoundingClientRect();
          return { x: r.left - origin.left + r.width / 2, y: r.top - origin.top + r.height / 2, left: r.left - origin.left, right: r.right - origin.left, top: r.top - origin.top, bottom: r.bottom - origin.top, width: r.width, height: r.height };
        };
        const phone = root.querySelector('.phone');
        const hub = root.querySelector('.integration-hub');
        const field = root.querySelector('.notification-field');
        const cards = [...root.querySelectorAll('.thread-notification')];
        const geometry = {
          width: origin.width,
          hero: root.querySelector('.hero')?.offsetHeight || 740,
          field: field ? box(field) : null,
          cardCount: cards.length,
          phone: phone ? box(phone) : null,
          hub: hub ? box(hub) : null,
          apps: [...root.querySelectorAll('.integration')].map(box),
        };
        const result = buildThreadGeometry(geometry);
        result.cardPositions.forEach((position, i) => {
          const card = cards[i];
          card.style.left = `${position.x - geometry.field.left}px`;
          card.style.top = `${position.y - geometry.field.top - card.offsetHeight / 2}px`;
        });
        setLayout({ width: origin.width, height: origin.height, paths: result.paths });
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root.querySelectorAll('section, .phone, .notification-field').forEach(element => observer.observe(element));
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure);
    measure();
    return () => { disposed = true; observer.disconnect(); window.removeEventListener('resize', measure); cancelAnimationFrame(frame); };
  }, [sceneRef]);

  useEffect(() => {
    const svg = svgRef.current;
    const root = sceneRef.current;
    if (!svg || !root) return;
    let frame = 0;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const paths = [...svg.querySelectorAll('.thread-progress')].map(path => ({ path, length: path.getTotalLength() }));
    const render = () => {
      frame = 0;
      const box = root.getBoundingClientRect();
      const progress = media.matches ? 1 : clamp((window.innerHeight * .7 - box.top) / Math.max(1, root.querySelector('#product')?.offsetTop + 350), .07, 1);
      paths.forEach(({ path, length }) => {
        path.style.strokeDasharray = `${length}`;
        path.style.strokeDashoffset = `${length * (1 - progress)}`;
      });
      const pageProgress = clamp((-box.top + window.innerHeight) / box.height, 0, 1);
      root.style.setProperty('--page-progress', pageProgress);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    media.addEventListener('change', schedule);
    render();
    return () => { window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); media.removeEventListener('change', schedule); cancelAnimationFrame(frame); };
  }, [layout, sceneRef]);

  return <svg ref={svgRef} className="page-threads" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} fill="none" aria-hidden="true" focusable="false">
    {layout.paths.map((item, i) => <g key={item.id} className={`thread-group thread-${item.kind}`}>
      <path className="thread-track" d={item.d} />
      {item.kind === 'gather' && i % 3 === 1 && <path className="thread-progress" d={item.d} />}
      <path className="thread-packet" d={item.d} pathLength="1000" style={{ '--packet-delay': `${-i * 2.3}s`, '--packet-duration': `${item.kind === 'app' ? 7 : item.kind === 'continue' ? 32 : 18}s` }} />
    </g>)}
  </svg>;
}

export default function PageMotion({ children }) {
  const sceneRef = useRef(null);
  useEffect(() => {
    const root = sceneRef.current;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let observer;
    const elements = [...root.querySelectorAll('.section-heading, .product-copy, .thread-notification, .use-case-card, .integration, .customer-card, .plan, .faq-list')];
    const setup = () => {
      observer?.disconnect();
      if (media.matches || !('IntersectionObserver' in window)) {
        elements.forEach(element => element.classList.remove('will-reveal'));
        return;
      }
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } });
      }, { threshold: .08, rootMargin: '0px 0px -25px 0px' });
      elements.forEach((element, i) => {
        // Don't transform geometry anchors; reveal their inner content instead.
        element.style.setProperty('--reveal-delay', `${i % 3 * 70}ms`);
        element.classList.add('will-reveal');
        if (element.getBoundingClientRect().top < window.innerHeight - 25) element.classList.add('is-visible');
        observer.observe(element);
      });
    };
    setup();
    media.addEventListener('change', setup);
    return () => { observer?.disconnect(); media.removeEventListener('change', setup); };
  }, []);
  return <div className="page-scene" ref={sceneRef}><ThreadNetwork sceneRef={sceneRef} />{children}</div>;
}
