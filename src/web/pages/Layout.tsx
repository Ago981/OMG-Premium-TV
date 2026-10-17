import { h, Fragment, type Child } from '../jsx';
import { appConfig } from '../../config';

export function Layout(props: { title?: string; page: string; children?: Child; narrow?: boolean }) {
    const m = appConfig.manifest;
    return (
        <html lang="en">
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <meta name="robots" content="noindex, nofollow" />
                <title>{props.title ? `${m.name} · ${props.title}` : m.name}</title>
                <link rel="stylesheet" href="/static/app.css" />
                <script src="/static/i18n.js" defer></script>
                <script src="/static/presets.js" defer></script>
                <script src="/static/app.js" defer></script>
            </head>
            <body data-page={props.page}>
                <div className={props.narrow ? 'content narrow' : 'content'}>
                    <div className="lang-bar">
                        <a href="#" data-lang="en">🇬🇧 ENG</a> | <a href="#" data-lang="it">🇮🇹 ITA</a> | <a href="#" data-lang="es">🇪🇸 ESP</a> | <a href="#" data-lang="fr">🇫🇷 FRA</a>
                    </div>
                    <a href="/" className="brand">
                        <img className="logo" src={m.logo} alt="logo" />
                        <h1>{m.name} <span className="version">v{m.version}</span></h1>
                    </a>
                    {props.children}
                    <Footer />
                </div>
                <div id="toast" className="toast"></div>
                <div id="loaderOverlay" className="loader-overlay">
                    <div className="loader"></div>
                    <div id="loaderMessage" className="loader-message" data-i18n="loader_default">Processing...</div>
                </div>
            </body>
        </html>
    );
}

function Footer() {
    return (
        <div className="card footer">
            <p data-i18n="footer_credit">Addon made with passion by McCoy88f - GitHub Repository</p>
            <p><a href="https://github.com/mccoy88f/OMG-Premium-TV" target="_blank" rel="noopener">GitHub</a></p>
            <p data-i18n="support_title">Support this project!</p>
            <p>
                <a href="https://www.buymeacoffee.com/mccoy88f" target="_blank" rel="noopener">Buy me a beer (Buymeacoffee)</a>
                <span className="muted"> · </span>
                <a href="https://paypal.me/mccoy88f?country.x=IT&amp;locale.x=it_IT" target="_blank" rel="noopener" data-i18n="paypal">PayPal</a>
            </p>
            <p className="small muted">
                <strong data-i18n="disclaimer_title">Disclaimer:</strong>{' '}
                <span data-i18n="disclaimer_1">I am not responsible for any illegal use of this addon.</span>{' '}
                <span data-i18n="disclaimer_2">Check and comply with the laws in your country!</span>
            </p>
        </div>
    );
}

export function Collapsible(props: { id: string; titleKey: string; title: string; open?: boolean; children?: Child }) {
    return (
        <div className="collapsible">
            <div className="collapsible-header" data-toggle={props.id}>
                <strong data-i18n={props.titleKey}>{props.title}</strong>
                <span className="toggle-icon">{props.open ? '▲' : '▼'}</span>
            </div>
            <div className={props.open ? 'collapsible-content show' : 'collapsible-content'} id={props.id}>
                {props.children}
            </div>
        </div>
    );
}

export function Field(props: { labelKey: string; label: string; children?: Child; hintKey?: string; hint?: string }) {
    return (
        <>
            <label data-i18n={props.labelKey}>{props.label}</label>
            {props.children}
            {props.hint ? <small className="hint" data-i18n={props.hintKey}>{props.hint}</small> : null}
        </>
    );
}
