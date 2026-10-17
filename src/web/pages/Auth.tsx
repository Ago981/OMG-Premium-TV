import { h } from '../jsx';
import { Layout } from './Layout';

/** Home: crea una nuova configurazione oppure apri una esistente con id + password. */
export function HomePage(props: { gateRequired: boolean }) {
    return (
        <Layout page="home" narrow>
            <div className="card">
                <h2 data-i18n="home_new_title">New configuration</h2>
                <p className="muted" data-i18n="home_new_desc">Create your configuration: you will get a private ID and protect it with a password. The playlist and EPG addresses are stored on the server and never appear in the addon URL.</p>
                <a className="button" href="/new" data-i18n="home_new_button">CREATE CONFIGURATION</a>
                {props.gateRequired ? <p className="small muted" data-i18n="home_gate_note">An access password, provided by the administrator, is required to create new configurations.</p> : null}
            </div>
            <div className="card">
                <h2 data-i18n="home_manage_title">Manage an existing configuration</h2>
                <form id="openConfigForm" className="form">
                    <label data-i18n="config_id">Configuration ID</label>
                    <input type="text" name="id" required autocomplete="username" placeholder="e.g. lYCvjyUkkPssucyL5UwmgA" />
                    <small className="hint" data-i18n="config_id_hint">You can also paste the manifest URL.</small>
                    <label data-i18n="password">Password</label>
                    <input type="password" name="password" required autocomplete="current-password" />
                    <button type="submit" data-i18n="open_config">OPEN CONFIGURATION</button>
                    <p className="error" id="openConfigError"></p>
                </form>
            </div>
        </Layout>
    );
}

/** Password di accesso (impostata dall'admin) richiesta per creare nuove configurazioni. */
export function GatePage(props: { returnUrl: string }) {
    return (
        <Layout page="gate" narrow title="Access">
            <div className="card">
                <h2 data-i18n="gate_title">Access</h2>
                <p className="muted" data-i18n="gate_desc">Enter the access password to create a new configuration.</p>
                <form id="gateForm" className="form" data-return={props.returnUrl}>
                    <input type="password" name="password" required autofocus autocomplete="current-password" data-i18n-placeholder="password" placeholder="Password" />
                    <button type="submit" data-i18n="login">Log in</button>
                    <p className="error" id="gateError"></p>
                </form>
            </div>
        </Layout>
    );
}

export function ConfigLoginPage(props: { id: string; legacy: boolean }) {
    return (
        <Layout page="config-login" narrow title="Login">
            <div className="card">
                <h2 data-i18n="config_login_title">Configuration access</h2>
                <p className="muted"><span data-i18n="config_id">Configuration ID</span>: <code>{props.id}</code></p>
                {props.legacy
                    ? <p className="warning" data-i18n="legacy_no_password">This configuration comes from an old installation link and has no password. Ask the administrator, or create a new configuration and reinstall the addon.</p>
                    : (
                        <form id="configLoginForm" className="form" data-id={props.id}>
                            <input type="text" name="username" value={props.id} autocomplete="username" hidden />
                            <label data-i18n="password">Password</label>
                            <input type="password" name="password" required autofocus autocomplete="current-password" />
                            <button type="submit" data-i18n="login">Log in</button>
                            <p className="error" id="configLoginError"></p>
                        </form>
                    )}
            </div>
        </Layout>
    );
}

export function AdminLoginPage() {
    return (
        <Layout page="admin-login" narrow title="Admin">
            <div className="card">
                <h2 data-i18n="admin_title">Administration</h2>
                <form id="adminLoginForm" className="form">
                    <input type="text" name="username" value="admin" autocomplete="username" hidden />
                    <label data-i18n="admin_password">Admin password</label>
                    <input type="password" name="password" required autofocus autocomplete="current-password" />
                    <button type="submit" data-i18n="login">Log in</button>
                    <p className="error" id="adminLoginError"></p>
                </form>
            </div>
        </Layout>
    );
}
