export function createServerlessHandler(initialize, logger = console) {
  let pending;
  const ready = () => {
    if (!pending) pending = Promise.resolve().then(initialize).catch(error => { pending = undefined; throw error; });
    return pending;
  };
  return async function handler(req, res) {
    const started = Date.now();
    const path = (req.url || '/').split('?')[0];
    // Never log cookies, headers, bodies, query strings, or raw driver errors.
    logger.info('[API] request', req.method, path);
    res.once('finish', () => logger.info('[API] response', req.method, path, res.statusCode, `${Date.now() - started}ms`));
    res.setHeader('Cache-Control', 'no-store');
    try {
      const app = await ready();
      return app(req, res);
    } catch (error) {
      logger.error('[API] startup failed', error.publicCode || 'API_STARTUP_FAILED', error.publicMessage || 'Check server configuration and database access.');
      if (res.headersSent) return res.end();
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Retry-After', '5');
      res.end(JSON.stringify({ code: error.publicCode || 'API_STARTUP_FAILED', message: error.publicMessage || 'The API is starting or unavailable. Check Vercel runtime logs and try again.' }));
    }
  };
}
