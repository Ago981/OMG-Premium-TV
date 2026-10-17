import { h, Fragment } from '../jsx';
import { appConfig } from '../../config';
import { MIN_PASSWORD_LENGTH } from '../../store/config-store';
import type { UserConfig } from '../../types';
import { Collapsible, Field, Layout } from './Layout';

const LANGUAGES = ['Italiano', 'English', 'Español', 'Français', 'Deutsch', 'Português', 'Nederlands', 'Polski', 'Русский', 'العربية', '中文', '日本語', '한국어'];
const LOCKED_M3U = 'https://github.com/mccoy88f/OMG-Premium-TV/blob/main/tv.png?raw=true';

export interface EditorProps {
    mode: 'new' | 'edit';
    config: UserConfig;
    id?: string;
    label?: string;
    manifestUrl?: string;
    pythonAllowed: boolean;
    streamMaskingAvailable: boolean;
    created?: boolean;
}

function Check(props: { name: string; checked: boolean; labelKey: string; label: string; form?: string }) {
    return (
        <label className="check">
            <input type="checkbox" name={props.name} checked={props.checked} form={props.form} />
            <span data-i18n={props.labelKey}>{props.label}</span>
        </label>
    );
}

function InstallBox(props: { manifestUrl: string; id: string; created?: boolean }) {
    return (
        <div className="card">
            {props.created ? (
                <div className="success-box">
                    <strong data-i18n="created_title">Configuration created!</strong>
                    <p data-i18n="created_desc">Write down the ID and the password: you need them to change the configuration from any device.</p>
                </div>
            ) : null}
            <p className="muted"><span data-i18n="config_id">Configuration ID</span>: <code id="configIdValue">{props.id}</code></p>
            <div className="manifest-url">
                <strong>Manifest URL:</strong><br />
                <span id="manifestUrl">{props.manifestUrl}</span>
            </div>
            <div className="buttons">
                <button type="button" data-action="copy-manifest" data-i18n="copy_manifest">COPY MANIFEST URL</button>
                <button type="button" data-action="install" data-i18n="install_stremio">INSTALL ON STREMIO</button>
            </div>
            <p className="small muted" data-i18n="manifest_private_note">The manifest URL is private: whoever has it can watch with your configuration (but cannot see or change it without the password).</p>
        </div>
    );
}

function PythonSection(props: { config: UserConfig }) {
    const c = props.config;
    return (
        <Collapsible id="python-section" titleKey="python_title" title="Generate playlist with Python script">
            <div className="info-box">
                <p><strong data-i18n="python_intro">This feature allows you to:</strong></p>
                <ul>
                    <li data-i18n="python_desc_1">Download a Python script from a URL</li>
                    <li data-i18n="python_desc_2">Run it inside the Docker container</li>
                    <li data-i18n="python_desc_3">Use the generated M3U file as source</li>
                </ul>
                <p><strong>Note:</strong> <span data-i18n="python_note">The URL must point to a Python script that generates an M3U file.</span></p>
            </div>
            <Field labelKey="python_script_url" label="Python script URL:">
                <input type="url" name="python_script_url" form="configForm" value={c.python_script_url} placeholder="https://example.com/script.py" />
            </Field>
            <div className="row">
                <button type="button" data-action="python-download" data-i18n="download_script">DOWNLOAD SCRIPT</button>
                <button type="button" data-action="python-execute" data-i18n="execute_script">EXECUTE SCRIPT</button>
                <button type="button" data-action="python-status" data-i18n="check_status">CHECK STATUS</button>
            </div>
            <h4 data-i18n="auto_update">Automatic update</h4>
            <input type="text" name="python_update_interval" form="configForm" value={c.python_update_interval} placeholder="HH:MM (e.g. 12:00)" />
            <small className="hint" data-i18n="interval_saved_hint">Format HH:MM (12:00 = every 12 hours, 0:30 = every 30 minutes). Applied when you save the configuration; leave empty to disable.</small>
            <div id="pythonStatus" className="status-box hidden">
                <h3 data-i18n="python_status_title">Python script status</h3>
                <div id="pythonStatusContent"></div>
            </div>
            <div id="generatedM3uUrl" className="status-box ok hidden">
                <h3 data-i18n="generated_playlist_title">Generated playlist URL</h3>
                <code id="m3uUrlContent"></code>
                <button type="button" data-action="python-use" data-i18n="use_playlist">USE THIS PLAYLIST</button>
            </div>
        </Collapsible>
    );
}

function ResolverSection(props: { config: UserConfig }) {
    const c = props.config;
    return (
        <Collapsible id="resolver-section" titleKey="resolver_title" title="Python Resolver for streams">
            <Field labelKey="resolver_script" label="Python Resolver script URL:">
                <input type="url" name="resolver_script" form="configForm" value={c.resolver_script} placeholder="https://example.com/resolver.py" />
            </Field>
            <Check name="resolver_enabled" form="configForm" checked={c.resolver_enabled} labelKey="resolver_enabled" label="Enable Python Resolver" />
            <div className="info-box">
                <p><strong data-i18n="resolver_what">What is the Python Resolver?</strong></p>
                <ul>
                    <li data-i18n="resolver_1">Resolve streaming URLs dynamically</li>
                    <li data-i18n="resolver_2">Add authentication tokens to streams</li>
                    <li data-i18n="resolver_3">Handle protected APIs for content providers</li>
                    <li data-i18n="resolver_4">Customise requests with specific headers</li>
                </ul>
                <p><strong>Note:</strong> <span data-i18n="resolver_note">A Python script implementing the resolve_link function is required.</span></p>
            </div>
            <div className="row">
                <button type="button" data-action="resolver-download" data-i18n="download_script">DOWNLOAD SCRIPT</button>
                <a className="button" href="/api/resolver-template" data-i18n="create_template">CREATE TEMPLATE</a>
                <button type="button" data-action="resolver-check" data-i18n="verify_script">VERIFY SCRIPT</button>
                <button type="button" data-action="resolver-clear" data-i18n="clear_cache">CLEAR CACHE</button>
            </div>
            <h4 data-i18n="cache_updates">Cache and update management</h4>
            <input type="text" name="resolver_update_interval" form="configForm" value={c.resolver_update_interval} placeholder="HH:MM (e.g. 12:00)" />
            <small className="hint" data-i18n="interval_saved_hint">Format HH:MM (12:00 = every 12 hours, 0:30 = every 30 minutes). Applied when you save the configuration; leave empty to disable.</small>
            <div id="resolverStatus" className="status-box hidden">
                <h3 data-i18n="resolver_status_title">Python Resolver status</h3>
                <div id="resolverStatusContent"></div>
            </div>
        </Collapsible>
    );
}

function AccountSection() {
    return (
        <div className="card">
            <Collapsible id="account-section" titleKey="account_title" title="Password and configuration">
                <h4 data-i18n="change_password">Change password</h4>
                <form id="passwordForm" className="form">
                    <input type="password" name="current" required autocomplete="current-password" data-i18n-placeholder="current_password" placeholder="Current password" />
                    <input type="password" name="password" required minlength={MIN_PASSWORD_LENGTH} autocomplete="new-password" data-i18n-placeholder="new_password" placeholder="New password" />
                    <input type="password" name="confirm" required minlength={MIN_PASSWORD_LENGTH} autocomplete="new-password" data-i18n-placeholder="confirm_password" placeholder="Confirm password" />
                    <button type="submit" data-i18n="change_password">Change password</button>
                    <p className="error" id="passwordError"></p>
                </form>
                <h4 data-i18n="backup_title">Backup</h4>
                <div className="row">
                    <button type="button" data-action="backup" data-i18n="backup">BACKUP CONFIGURATION</button>
                    <input type="file" id="restoreFile" accept=".json" hidden />
                    <button type="button" data-action="restore" data-i18n="restore">RESTORE CONFIGURATION</button>
                </div>
                <small className="hint" data-i18n="restore_hint">Restoring fills the form: remember to save afterwards.</small>
                <h4 data-i18n="danger_zone">Danger zone</h4>
                <div className="row">
                    <button type="button" className="secondary" data-action="logout" data-i18n="logout">LOG OUT</button>
                    <button type="button" className="danger" data-action="delete-config" data-i18n="delete_config">DELETE CONFIGURATION</button>
                </div>
            </Collapsible>
        </div>
    );
}

export function ConfigEditorPage(props: EditorProps) {
    const c = props.config;
    const locked = !appConfig.customized;
    return (
        <Layout page={props.mode === 'new' ? 'config-new' : 'config-edit'} title={props.mode === 'new' ? 'New' : props.label || props.id}>
            {props.mode === 'edit' && props.manifestUrl && props.id
                ? <InstallBox manifestUrl={props.manifestUrl} id={props.id} created={props.created} />
                : null}
            <div className="card">
                <h2 data-i18n="playlist_epg">Playlist &amp; EPG</h2>
                <div className="preset-box">
                    <h3 data-i18n="preset_title">Preset lists (optional)</h3>
                    <p className="small muted" data-i18n="preset_desc">Adds predefined iptv-org playlist and iptv-epg.org EPG URLs to your configuration.</p>
                    <div className="row">
                        <select id="presetCountry"><option value="" data-i18n="preset_select">— Select country —</option></select>
                        <button type="button" className="ok" data-action="preset" data-i18n="preset_apply">Add to configuration</button>
                    </div>
                </div>
                <form id="configForm" className="form" data-mode={props.mode} data-id={props.id || ''}>
                    <Field labelKey="config_label" label="Name (optional)" hintKey="config_label_hint" hint="Only for you: shown in the addon name in Stremio.">
                        <input type="text" name="label" maxlength={80} value={props.label || ''} />
                    </Field>
                    <Field labelKey="m3u_url" label="M3U URL:" hintKey="m3u_hint" hint="💡 You can enter multiple M3U URLs separated by a comma (,)">
                        <input type="text" name="m3u" required readonly={locked} value={locked ? LOCKED_M3U : c.m3u}
                            data-i18n-placeholder="m3u_placeholder" placeholder="https://example.com/playlist1.m3u,https://example.com/playlist2.m3u" />
                    </Field>
                    <Field labelKey="epg_url" label="EPG URL:" hintKey="epg_hint" hint="💡 You can enter multiple EPG URLs separated by a comma (,)">
                        <input type="text" name="epg" value={c.epg} data-i18n-placeholder="epg_placeholder" placeholder="https://example.com/epg1.xml,https://example.com/epg2.xml" />
                    </Field>
                    <Check name="epg_enabled" checked={c.epg_enabled} labelKey="enable_epg" label="Enable EPG" />
                    <Field labelKey="channel_language" label="Channel language:" hintKey="channel_language_hint" hint="Only used for compatibility with AIOStreams.">
                        <select name="language">
                            {LANGUAGES.map(l => <option value={l} selected={(c.language || 'Italiano') === l}>{l}</option>)}
                        </select>
                    </Field>

                    <Collapsible id="advanced-settings" titleKey="advanced_settings" title="Advanced settings">
                        <Field labelKey="proxy_url" label="Proxy URL:">
                            <input type="url" name="proxy" value={c.proxy} />
                        </Field>
                        <Field labelKey="proxy_pwd" label="Proxy password:">
                            <input type="password" name="proxy_pwd" value={c.proxy_pwd} autocomplete="off" />
                        </Field>
                        <Check name="force_proxy" checked={c.force_proxy} labelKey="force_proxy" label="Force proxy" />
                        {props.streamMaskingAvailable ? (
                            <>
                                <Check name="mask_streams" checked={c.mask_streams} labelKey="mask_streams" label="Hide real stream URLs" />
                                <small className="hint" data-i18n="mask_streams_hint">Stremio receives a link to this server instead of the proxy/source URL (hides the proxy password and address).</small>
                            </>
                        ) : null}
                        <Field labelKey="id_suffix" label="ID suffix:">
                            <input type="text" name="id_suffix" value={c.id_suffix} data-i18n-placeholder="id_suffix_placeholder" placeholder="Example: it" />
                        </Field>
                        <Field labelKey="remapper_path" label="Remapper file path:">
                            <input type="text" name="remapper_path" value={c.remapper_path} data-i18n-placeholder="remapper_placeholder" placeholder="Example: https://raw.githubusercontent.com/..." />
                        </Field>
                        <Field labelKey="update_interval" label="Playlist update interval:" hintKey="update_interval_hint" hint="Format HH:MM (e.g. 1:00 or 01:00), default 12:00">
                            <input type="text" name="update_interval" value={c.update_interval || '12:00'} placeholder="HH:MM (default 12:00)" />
                        </Field>
                    </Collapsible>

                    {props.mode === 'new' ? (
                        <div className="password-box">
                            <h3 data-i18n="set_password_title">Protect your configuration</h3>
                            <p className="small muted" data-i18n="set_password_desc">The password is needed to view or change the configuration later. It cannot be recovered.</p>
                            <input type="password" name="password" required minlength={MIN_PASSWORD_LENGTH} autocomplete="new-password" data-i18n-placeholder="new_password" placeholder="Password" />
                            <input type="password" name="confirm" required minlength={MIN_PASSWORD_LENGTH} autocomplete="new-password" data-i18n-placeholder="confirm_password" placeholder="Confirm password" />
                            <small className="hint"><span data-i18n="password_min">Minimum characters:</span> {MIN_PASSWORD_LENGTH}</small>
                        </div>
                    ) : null}
                    <p className="error" id="configError"></p>
                    <button type="submit" className="wide" data-i18n={props.mode === 'new' ? 'create_config' : 'save_config'}>
                        {props.mode === 'new' ? 'CREATE CONFIGURATION' : 'SAVE CONFIGURATION'}
                    </button>
                </form>
            </div>

            {props.mode === 'edit' ? (
                <>
                    {props.pythonAllowed ? (
                        <div className="card">
                            <PythonSection config={c} />
                            <ResolverSection config={c} />
                        </div>
                    ) : (
                        <div className="card"><p className="muted" data-i18n="python_disabled">Python scripts are disabled on this server.</p></div>
                    )}
                    <AccountSection />
                </>
            ) : (
                <div className="card"><p className="muted small" data-i18n="python_after_create">Python generator and resolver can be set up after creating the configuration.</p></div>
            )}
        </Layout>
    );
}
