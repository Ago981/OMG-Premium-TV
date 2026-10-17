import path from 'path';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { env } from './env';
import * as logger from './logger';
import { addonRouter } from './routes/addon-routes';
import { webRouter } from './routes/web-routes';
import { originGuard, securityHeaders } from './security/http';
import { I18N } from './web/i18n';

export function createApp(): express.Express {
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', env.trustProxy);

    app.use(originGuard);
    app.use(securityHeaders);
    app.use(express.json({ limit: '256kb' }));
    app.use(cookieParser());

    const i18nJs = `window.I18N = ${JSON.stringify(I18N).replace(/</g, '\\u003c')};`;
    app.get('/static/i18n.js', (_req, res) => {
        res.type('application/javascript').setHeader('Cache-Control', 'public, max-age=3600');
        res.send(i18nJs);
    });
    app.use('/static', express.static(path.join(env.rootDir, 'public'), { maxAge: '1h', index: false }));

    app.use(addonRouter);
    app.use(webRouter);

    app.use((_req, res) => {
        res.status(404).type('text/plain').send('Not found');
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
        logger.error('_', `Unhandled error on ${req.method} ${req.path}:`, logger.errMsg(err));
        if (res.headersSent) return;
        res.status(500).json({ success: false, message: 'Internal server error' });
    });
    return app;
}
