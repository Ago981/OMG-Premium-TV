import { h, Fragment, type Child } from '../jsx';
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

const STEPS = [
    { id: 'source', key: 'step_source', title: 'Playlist' },
    { id: 'epg', key: 'step_epg', title: 'TV guide' },
    { id: 'proxy', key: 'step_proxy', title: 'Proxy' },
    { id: 'advanced', key: 'step_advanced', title: 'Advanced' },
    { id: 'confirm', key: 'step_confirm', title: 'Confirm' }
];

function Check(props: { name: string; checked: boolean; labelKey: string; label: string }) {
    return (
        <label className="check">
            <input type="checkbox" name={props.name} checked={props.checked} />
            <span data-i18n={props.labelKey}>{props.label}</span>
        </label>
    );
}

function Step(props: { index: number; children?: Child }) {
    const s = STEPS[props.index];
    return (
        <section className={props.index === 0 ? 'step active' : 'step'} data-step={s.id}>
            <h2><span className="step-num">{props.index + 1}</span> <span data-i18n={s.key}>{s.title}</span></h2>
            {props.children}
        </section>
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
            <div id="vodInstallNote" className="notice-box hidden" data-i18n="vod_install_note">Movies and series are still being prepared: wait for "Ready" below before installing, or reinstall the addon afterwards to get the category filters.</div>
            <p className="small muted" data-i18n="install_nuvio_hint">Nuvio and other Stremio-compatible apps: add the manifest URL in the addons section.</p>
            <p className="small muted" data-i18n="manifest_private_note">The manifest URL contains only the configuration ID. Keep it private.</p>
        </div>
    );
}

function SourceStep(props: { c: UserConfig; label?: string; edit: boolean }) {
    const locked = !appConfig.customized;
    return (
        <Step index={0}>
            <Field labelKey="country" label="Country" hintKey="country_hint" hint="Used for the preset playlist and the default TV guide.">
                <div className="row">
                    <select id="countrySelect" name="country" data-value={props.c.country}>
                        <option value="" data-i18n="preset_select">— Select country —</option>
                    </select>
                    <button type="button" className="ok" data-action="use-country-playlist" data-i18n="use_country_playlist">Use the country playlist</button>
                </div>
            </Field>
            <Field labelKey="channel_language" label="Language" hintKey="channel_language_hint" hint="Channel and stream language (AIOStreams) and language of movie and series titles and posters (TMDB).">
                <select name="language">
                    {LANGUAGES.map(l => <option value={l} selected={(props.c.language || 'Italiano') === l}>{l}</option>)}
                </select>
            </Field>
            <Field labelKey="config_label" label="Name (optional)" hintKey="config_label_hint" hint="Only for you: shown in the addon name.">
                <input type="text" name="label" maxlength={80} value={props.label || ''} />
            </Field>
            <div className="source-switch" role="radiogroup">
                <label className="check"><input type="radio" name="source_type" value="m3u" checked={props.c.source_type !== 'xtream'} /> <span data-i18n="source_m3u">M3U playlist</span></label>
                <label className="check"><input type="radio" name="source_type" value="xtream" checked={props.c.source_type === 'xtream'} /> <span data-i18n="source_xtream">Xtream Codes account</span></label>
            </div>
            <div className="source-panel" data-source="m3u">
                <Field labelKey="m3u_url" label="M3U URL:" hintKey="m3u_hint" hint="You can enter multiple M3U URLs separated by a comma (,)">
                    <input type="text" name="m3u" required readonly={locked} value={locked ? LOCKED_M3U : props.c.m3u}
                        data-i18n-placeholder="m3u_placeholder" placeholder="https://example.com/playlist1.m3u,https://example.com/playlist2.m3u" />
                </Field>
            </div>
            <div className="source-panel" data-source="xtream">
                <Field labelKey="xtream_server" label="Server" hintKey="xtream_server_hint" hint="e.g. http://provider.example:8080 — you can also paste the full get.php link, username and password are read from it.">
                    <input type="text" name="xtream_server" value={props.c.xtream_server} placeholder="http://provider.example:8080" autocomplete="off" />
                </Field>
                <Field labelKey="xtream_username" label="Username">
                    <input type="text" name="xtream_username" value={props.c.xtream_username} autocomplete="off" />
                </Field>
                <Field labelKey="xtream_password" label="Password">
                    <input type="password" name="xtream_password" value={props.c.xtream_password} autocomplete="off" />
                </Field>
                <Field labelKey="xtream_format" label="Stream format" hintKey="xtream_format_hint" hint="HLS (m3u8) works on more players; MPEG-TS uses less server resources.">
                    <select name="xtream_format">
                        <option value="m3u8" selected={props.c.xtream_format !== 'ts'}>HLS (m3u8)</option>
                        <option value="ts" selected={props.c.xtream_format === 'ts'}>MPEG-TS (ts)</option>
                    </select>
                </Field>
                <div className="row">
                    <button type="button" className="secondary" data-action="xtream-test" data-i18n="xtream_test">Check account</button>
                    <span id="xtreamTestResult" className="small"></span>
                </div>
                <small className="hint" data-i18n="xtream_epg_hint">The provider's TV guide (xmltv.php) is used automatically when the EPG field is empty.</small>
                <Check name="xtream_vod" checked={props.c.xtream_vod} labelKey="xtream_vod" label="Include movies and TV series" />
                <div className="vod-fields">
                    <small className="hint" data-i18n="xtream_vod_hint">Adds Movies and Series catalogs. With a TMDB key the titles are linked to their IMDb pages, so the stream also appears when you open a movie from Stremio's own pages.</small>
                    <Field labelKey="tmdb_api_key" label="TMDB API key" hintKey="tmdb_key_hint" hint="Free at themoviedb.org → Settings → API: API key (v3) or Read Access Token (v4). Used only for your titles.">
                        <input type="password" name="tmdb_api_key" value={props.c.tmdb_api_key} autocomplete="off" />
                    </Field>
                    <div className="row half-buttons">
                        <button type="button" className="secondary" data-action="tmdb-test" data-i18n="tmdb_test">Check key</button>
                    </div>
                    <div id="tmdbTestResult" className="small"></div>
                    {props.edit ? <div id="vodStatus" className="small muted"></div> : null}
                    <small className="hint" data-i18n="vod_update_hint">Movies and series are updated together with the playlist: at the update interval and with the "Refresh M3U playlist" channel.</small>
                    <textarea name="vod_excluded" className="hidden">{props.c.vod_excluded}</textarea>
                    {props.edit ? (
                        <>
                            <Collapsible id="vodCategoriesBox" titleKey="vod_exclude_title" title="Categories to hide">
                                <small className="hint" data-i18n="vod_exclude_hint">Ticked categories (and their subcategories) disappear from catalogs, search and streams. Save to apply; reinstall the addon to update the filter list in Stremio.</small>
                                <div id="vodCategories" className="cat-list"></div>
                            </Collapsible>
                        </>
                    ) : (
                        <small className="hint" data-i18n="vod_exclude_later">After saving you can choose which categories to hide.</small>
                    )}
                </div>
            </div>
        </Step>
    );
}

function EpgStep(props: { c: UserConfig }) {
    return (
        <Step index={1}>
            <Check name="epg_enabled" checked={props.c.epg_enabled} labelKey="enable_epg" label="Enable EPG" />
            <Check name="smart_epg" checked={props.c.smart_epg !== false} labelKey="smart_epg" label="Smart EPG matching" />
            <small className="hint" data-i18n="smart_epg_hint">Matches EPG permissively (ignores HD/SD/4K quality tags, channel numbers, and matches on name). Recommended to leave enabled unless your playlist already has strictly dedicated EPG IDs.</small>
            <Field labelKey="epg_url" label="EPG URL:" hintKey="epg_hint" hint="You can enter multiple EPG URLs separated by a comma (,)">
                <input type="text" name="epg" value={props.c.epg} data-i18n-placeholder="epg_placeholder" placeholder="https://example.com/epg1.xml,https://example.com/epg2.xml" />
                <small className="hint xtream-only" data-i18n="epg_xtream_hint">Leave empty to use the TV guide provided by the Xtream configuration.</small>
            </Field>
            <div className="preset-box">
                <h3 data-i18n="epg_presets">Preset TV guides</h3>
                <p className="small muted" data-i18n="epg_presets_hint">Don't have an EPG? Pick one: it is downloaded once on the server and shared with everyone who uses it.</p>
                <div className="row">
                    <select id="epgPresetSelect"></select>
                    <button type="button" className="ok" data-action="add-epg-preset" data-i18n="epg_preset_add">Add</button>
                </div>
            </div>
            <p className="small muted" id="epgFallbackInfo" data-i18n="epg_fallback_hint">If the field is empty, the guide declared in the playlist (url-tvg) is used, otherwise the preset guide of the selected country.</p>
        </Step>
    );
}

function ProxyStep(props: { c: UserConfig; masking: boolean }) {
    const c = props.c;
    return (
        <Step index={2}>
            <div className="info-box recommended">
                <p><span className="badge ok" data-i18n="proxy_recommended">Recommended</span> <strong data-i18n="proxy_why_title">Why use a proxy</strong></p>
                <ul>
                    <li data-i18n="proxy_why_1">With a proxy (MediaFlow Proxy or EasyProxy) everything goes through it: the playlist download and every stream. Sources only see the proxy's IP.</li>
                    <li data-i18n="proxy_why_2">It also plays streams that need special headers, extractors (DaddyLive, Vavoo…) or ClearKey DRM keys.</li>
                    <li data-i18n="proxy_why_3">Without a proxy, streams are opened directly by your device, from your IP.</li>
                </ul>
            </div>
            <Field labelKey="proxy_type" label="Proxy type">
                <select name="proxy_type">
                    <option value="auto" selected={c.proxy_type === 'auto'} data-i18n="proxy_type_auto">Detect automatically</option>
                    <option value="mediaflow" selected={c.proxy_type === 'mediaflow'}>MediaFlow Proxy</option>
                    <option value="easyproxy" selected={c.proxy_type === 'easyproxy'}>EasyProxy</option>
                </select>
            </Field>
            <Field labelKey="proxy_url" label="Proxy URL:">
                <input type="url" name="proxy" value={c.proxy} placeholder="https://proxy.example.com" />
            </Field>
            <Field labelKey="proxy_pwd" label="Proxy password:">
                <input type="password" name="proxy_pwd" value={c.proxy_pwd} autocomplete="off" />
            </Field>
            <div className="row">
                <button type="button" className="secondary" data-action="proxy-test" data-i18n="proxy_test">Test proxy</button>
                <span id="proxyTestResult" className="small"></span>
            </div>
            <Check name="force_proxy" checked={c.force_proxy} labelKey="force_proxy" label="Proxy only" />
            <small className="hint" data-i18n="force_proxy_hint">Show only streams through the proxy. Exclude direct fallback streams if proxy fails.</small>
            {props.masking ? (
                <>
                    <Check name="mask_streams" checked={c.mask_streams} labelKey="mask_streams" label="Hide real stream URLs" />
                    <small className="hint" data-i18n="mask_streams_hint">Stremio receives a link to this server instead of the proxy/source URL.</small>
                </>
            ) : null}
        </Step>
    );
}

function PythonSection(props: { c: UserConfig }) {
    const c = props.c;
    return (
        <Collapsible id="python-section" titleKey="python_title" title="Generate playlist with Python script">
            <div className="info-box">
                <p><strong data-i18n="python_intro">This feature allows you to:</strong></p>
                <ul>
                    <li data-i18n="python_desc_1">Download a Python script from a URL</li>
                    <li data-i18n="python_desc_2">Run it inside the Docker container</li>
                    <li data-i18n="python_desc_3">Use the generated M3U file as source</li>
                </ul>
            </div>
            <Field labelKey="python_script_url" label="Python script URL:">
                <input type="url" name="python_script_url" value={c.python_script_url} placeholder="https://example.com/script.py" />
            </Field>
            <div className="row">
                <button type="button" data-action="python-download" data-i18n="download_script">DOWNLOAD SCRIPT</button>
                <button type="button" data-action="python-execute" data-i18n="execute_script">EXECUTE SCRIPT</button>
                <button type="button" data-action="python-status" data-i18n="check_status">CHECK STATUS</button>
            </div>
            <label data-i18n="auto_update">Automatic update</label>
            <input type="text" name="python_update_interval" value={c.python_update_interval} placeholder="HH:MM (e.g. 12:00)" />
            <small className="hint" data-i18n="interval_saved_hint">Format HH:MM. Applied when you save; leave empty to disable.</small>
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

function ResolverSection(props: { c: UserConfig }) {
    const c = props.c;
    return (
        <Collapsible id="resolver-section" titleKey="resolver_title" title="Python Resolver for streams">
            <Field labelKey="resolver_script" label="Python Resolver script URL:">
                <input type="url" name="resolver_script" value={c.resolver_script} placeholder="https://example.com/resolver.py" />
            </Field>
            <Check name="resolver_enabled" checked={c.resolver_enabled} labelKey="resolver_enabled" label="Enable Python Resolver" />
            <p className="small muted" data-i18n="resolver_note">A Python script implementing the resolve_link function is required.</p>
            <div className="row">
                <button type="button" data-action="resolver-download" data-i18n="download_script">DOWNLOAD SCRIPT</button>
                <a className="button" href="/api/resolver-template" data-i18n="create_template">CREATE TEMPLATE</a>
                <button type="button" data-action="resolver-check" data-i18n="verify_script">VERIFY SCRIPT</button>
                <button type="button" data-action="resolver-clear" data-i18n="clear_cache">CLEAR CACHE</button>
            </div>
            <label data-i18n="cache_updates">Cache and update management</label>
            <input type="text" name="resolver_update_interval" value={c.resolver_update_interval} placeholder="HH:MM (e.g. 12:00)" />
            <small className="hint" data-i18n="interval_saved_hint">Format HH:MM. Applied when you save; leave empty to disable.</small>
            <div id="resolverStatus" className="status-box hidden">
                <h3 data-i18n="resolver_status_title">Python Resolver status</h3>
                <div id="resolverStatusContent"></div>
            </div>
        </Collapsible>
    );
}

function AdvancedStep(props: { c: UserConfig; mode: 'new' | 'edit'; pythonAllowed: boolean }) {
    const c = props.c;
    return (
        <Step index={3}>
            <Check name="aio_compatible" checked={c.aio_compatible} labelKey="aio_compatible" label="AIOStreams compatible mode" />
            <small className="hint" data-i18n="aio_compatible_hint">Appends country code [e.g. ITA] to channel and stream names for AIOStreams detection.</small>
            <Field labelKey="update_interval" label="Playlist update interval:" hintKey="update_interval_hint" hint="Format HH:MM (e.g. 1:00 or 01:00), default 12:00">
                <input type="text" name="update_interval" value={c.update_interval || '12:00'} placeholder="HH:MM (default 12:00)" />
            </Field>
            <Field labelKey="id_suffix" label="ID suffix:">
                <input type="text" name="id_suffix" value={c.id_suffix} data-i18n-placeholder="id_suffix_placeholder" placeholder="Example: it" />
            </Field>
            <Field labelKey="remapper_path" label="Remapper file path:">
                <input type="text" name="remapper_path" value={c.remapper_path} data-i18n-placeholder="remapper_placeholder" placeholder="Example: https://raw.githubusercontent.com/..." />
            </Field>
            {props.mode === 'edit'
                ? (props.pythonAllowed
                    ? <><PythonSection c={c} /><ResolverSection c={c} /></>
                    : <p className="muted small" data-i18n="python_disabled">Python scripts are disabled on this server.</p>)
                : <p className="muted small" data-i18n="python_after_create">Python generator and resolver can be set up after creating the configuration.</p>}
        </Step>
    );
}

function ConfirmStep(props: { mode: 'new' | 'edit' }) {
    return (
        <Step index={4}>
            <div id="configSummary" className="summary"></div>
            {props.mode === 'new' ? (
                <div className="password-box">
                    <h3 data-i18n="set_password_title">Protect your configuration</h3>
                    <p className="small muted" data-i18n="set_password_desc">The password is needed to view or change the configuration later. It cannot be recovered.</p>
                    <input type="password" name="password" required minlength={MIN_PASSWORD_LENGTH} autocomplete="new-password" data-i18n-placeholder="new_password" placeholder="Password" />
                    <input type="password" name="confirm" required minlength={MIN_PASSWORD_LENGTH} autocomplete="new-password" data-i18n-placeholder="confirm_password" placeholder="Confirm password" />
                    <small className="hint"><span data-i18n="password_min">Minimum characters:</span> {MIN_PASSWORD_LENGTH}</small>
                </div>
            ) : null}
        </Step>
    );
}

function AccountSection() {
    return (
        <div className="card">
            <Collapsible id="account-section" titleKey="account_title" title="Password, backup and deletion">
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
    const isNew = props.mode === 'new';
    return (
        <Layout page={isNew ? 'config-new' : 'config-edit'} title={isNew ? 'New' : props.label || props.id}>
            {!isNew && props.manifestUrl && props.id
                ? <InstallBox manifestUrl={props.manifestUrl} id={props.id} created={props.created} />
                : null}
            <div className="card">
                <nav className="stepper" id="stepper">
                    {STEPS.map((s, i) => (
                        <button type="button" className={i === 0 ? 'stepper-item active' : 'stepper-item'} data-goto={s.id}>
                            <span className="step-num">{i + 1}</span>
                            <span className="step-label" data-i18n={s.key}>{s.title}</span>
                        </button>
                    ))}
                </nav>
                <form id="configForm" className="form wizard" data-mode={props.mode} data-id={props.id || ''} novalidate>
                    <SourceStep c={c} label={props.label} edit={!isNew} />
                    <EpgStep c={c} />
                    <ProxyStep c={c} masking={props.streamMaskingAvailable} />
                    <AdvancedStep c={c} mode={props.mode} pythonAllowed={props.pythonAllowed} />
                    <ConfirmStep mode={props.mode} />
                    <p className="error" id="configError"></p>
                    <div className="wizard-nav">
                        <button type="button" className="secondary" data-action="prev" data-i18n="back">Back</button>
                        <button type="button" data-action="next" data-i18n="next">Next</button>
                        <button type="submit" className="ok submit-btn" data-i18n={isNew ? 'create_config' : 'save_config'}>
                            {isNew ? 'CREATE CONFIGURATION' : 'SAVE CONFIGURATION'}
                        </button>
                    </div>
                </form>
            </div>
            {!isNew ? <AccountSection /> : null}
        </Layout>
    );
}
