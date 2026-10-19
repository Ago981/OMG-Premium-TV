import { h, Fragment } from '../jsx';
import { hostOf } from '../../http-client';
import type { EpgSource } from '../../epg/epg-service';
import type { EgressStatus } from '../../http-client';
import type { PlaylistInfo } from '../../playlist/playlist-service';
import type { ConfigRecord } from '../../store/config-store';
import { Layout } from './Layout';

export interface AdminProps {
    configs: ConfigRecord[];
    epg: EpgSource[];
    playlists: PlaylistInfo[];
    queued: number[];
    stats: {
        uptime: string;
        memoryMb: number;
        dbKind: string;
        runtimes: number;
        programs: number;
    };
    settings: {
        gateEnabled: boolean;
        pythonEnabled: boolean;
        pythonEnvEnabled: boolean;
        streamMasking: boolean;
        originProtected: boolean;
        publicBaseUrl: string;
        legacyUrls: boolean;
        privateUrls: boolean;
        outboundProxy: string;
        outboundRequired: boolean;
        egress: EgressStatus | null;
    };
}

function date(ms: number | null | undefined): string {
    if (!ms) return '—';
    return new Date(Number(ms)).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
}

function hosts(list: string): string {
    return [...new Set(list.split(',').map(s => s.trim()).filter(Boolean).map(u => u.startsWith('omg://') ? 'python' : hostOf(u) || u))].join(', ');
}

function Flag(props: { on: boolean; label: string }) {
    return props.on ? <span className="badge">{props.label}</span> : null;
}

function ConfigsTable(props: { configs: ConfigRecord[] }) {
    return (
        <div className="card">
            <div className="row spread">
                <h2><span data-i18n="admin_configs">Configurations</span> ({props.configs.length})</h2>
                <input type="search" id="configFilter" data-i18n-placeholder="admin_filter" placeholder="Filter..." />
            </div>
            <div className="row">
                <button type="button" className="danger" data-action="admin-delete-selected" data-i18n="admin_delete_selected">DELETE SELECTED</button>
                <button type="button" className="secondary" data-action="admin-select-inactive" data-i18n="admin_select_inactive">Select inactive (30+ days)</button>
            </div>
            <div className="table-wrap">
                <table className="table" id="configsTable">
                    <thead>
                        <tr>
                            <th><input type="checkbox" id="selectAll" /></th>
                            <th>ID</th>
                            <th data-i18n="admin_col_name">Name</th>
                            <th data-i18n="admin_col_sources">Sources</th>
                            <th data-i18n="admin_col_features">Features</th>
                            <th data-i18n="admin_col_created">Created</th>
                            <th data-i18n="admin_col_last_access">Last access</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {props.configs.map(r => {
                            const c = r.config;
                            const last = r.lastAccess || r.createdAt;
                            return (
                                <tr data-id={r.id} data-last={String(last)} data-search={`${r.id} ${r.label} ${hosts(c.m3u)} ${hosts(c.xtream_server)} ${hosts(c.epg)}`.toLowerCase()}>
                                    <td><input type="checkbox" className="row-select" value={r.id} /></td>
                                    <td><code title={r.id}>{r.id.slice(0, 10)}…</code></td>
                                    <td>{r.legacy ? <span className="badge warn">legacy</span> : r.label || '—'}</td>
                                    <td className="small">
                                        {c.source_type === 'xtream'
                                            ? <div>Xtream: {hosts(c.xtream_server) || '—'} ({c.xtream_username})</div>
                                            : <div>M3U: {hosts(c.m3u) || '—'}</div>}
                                        {c.epg_enabled ? <div>EPG: {hosts(c.epg) || 'url-tvg'}</div> : null}
                                    </td>
                                    <td>
                                        <Flag on={c.epg_enabled} label="EPG" />
                                        <Flag on={!!c.proxy} label="proxy" />
                                        <Flag on={!!c.python_script_url} label="python" />
                                        <Flag on={c.resolver_enabled} label="resolver" />
                                    </td>
                                    <td className="small">{date(r.createdAt)}</td>
                                    <td className="small">{date(r.lastAccess)}</td>
                                    <td><button type="button" className="danger small-btn" data-action="admin-delete-one" data-id={r.id}>✕</button></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function EpgTable(props: { epg: EpgSource[]; queued: number[] }) {
    return (
        <div className="card">
            <h2><span data-i18n="admin_epg">Shared EPG sources</span> ({props.epg.length})</h2>
            <p className="small muted" data-i18n="admin_epg_desc">Each EPG URL is downloaded once and shared by every configuration that uses it.</p>
            <div className="table-wrap">
                <table className="table">
                    <thead>
                        <tr>
                            <th>URL</th>
                            <th data-i18n="admin_col_status">Status</th>
                            <th data-i18n="admin_col_channels">Channels</th>
                            <th data-i18n="admin_col_programs">Programmes</th>
                            <th data-i18n="admin_col_updated">Updated</th>
                            <th data-i18n="admin_col_last_access">Last access</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {props.epg.map(s => (
                            <tr>
                                <td className="small url-cell" title={hostOf(s.url)}>{hostOf(s.url) || s.url}</td>
                                <td>
                                    <span className={s.status === 'ok' ? 'badge ok' : s.status === 'error' ? 'badge err' : 'badge'}>
                                        {props.queued.includes(Number(s.id)) ? 'queued' : s.status}
                                    </span>
                                    {s.last_error ? <div className="small error-text">{s.last_error}</div> : null}
                                </td>
                                <td>{s.channels}</td>
                                <td>{s.programs}</td>
                                <td className="small">{date(s.updated_at)}{s.duration_ms ? ` (${Math.round(Number(s.duration_ms) / 1000)}s)` : ''}</td>
                                <td className="small">{date(s.last_used)}</td>
                                <td className="nowrap">
                                    <button type="button" className="small-btn" data-action="admin-epg-refresh" data-id={String(s.id)}>↻</button>
                                    <button type="button" className="danger small-btn" data-action="admin-epg-delete" data-id={String(s.id)}>✕</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function PlaylistTable(props: { playlists: PlaylistInfo[] }) {
    return (
        <div className="card">
            <h2><span data-i18n="admin_playlists">Shared playlists</span> ({props.playlists.length})</h2>
            <div className="table-wrap">
                <table className="table">
                    <thead>
                        <tr>
                            <th data-i18n="admin_col_sources">Sources</th>
                            <th data-i18n="admin_col_channels">Channels</th>
                            <th data-i18n="admin_col_updated">Updated</th>
                            <th data-i18n="admin_col_last_access">Last access</th>
                        </tr>
                    </thead>
                    <tbody>
                        {props.playlists.map(p => (
                            <tr>
                                <td className="small url-cell">
                                    {p.source}
                                    {p.lastError ? <div className="small error-text">{p.lastError}</div> : null}
                                </td>
                                <td>{p.channels}</td>
                                <td className="small">{date(p.updatedAt)}</td>
                                <td className="small">{date(p.lastUsed)}{p.inMemory ? ' · RAM' : ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function SettingsCard(props: { s: AdminProps['settings'] }) {
    const s = props.s;
    return (
        <div className="card">
            <h2 data-i18n="admin_settings">Settings</h2>
            <form id="adminSettingsForm" className="form">
                <h4 data-i18n="admin_gate_title">Access password for new configurations</h4>
                <p className="small muted" data-i18n="admin_gate_desc">If set, only those who know it can create configurations. Leave empty to allow everyone.</p>
                <label className="check">
                    <input type="checkbox" name="gate_enabled" checked={s.gateEnabled} />
                    <span data-i18n="admin_gate_enable">Require access password</span>
                </label>
                <input type="password" name="gate_password" autocomplete="new-password" data-i18n-placeholder="admin_gate_placeholder" placeholder="New access password (leave empty to keep)" />

                <h4 data-i18n="admin_python_title">Python scripts</h4>
                <label className="check">
                    <input type="checkbox" name="python_enabled" checked={s.pythonEnabled} disabled={!s.pythonEnvEnabled} />
                    <span data-i18n="admin_python_enable">Allow users to run Python scripts</span>
                </label>
                {!s.pythonEnvEnabled ? <small className="hint">PYTHON_ENABLED=false</small> : null}
                <small className="hint" data-i18n="admin_python_warning">Scripts run on your server: on a public instance disable them or trust your users.</small>
                <button type="submit" data-i18n="save">SAVE</button>
                <p className="error" id="adminSettingsError"></p>
            </form>

            <h4 data-i18n="admin_change_password">Change admin password</h4>
            <form id="adminPasswordForm" className="form">
                <input type="password" name="current" required autocomplete="current-password" data-i18n-placeholder="current_password" placeholder="Current password" />
                <input type="password" name="password" required minlength={8} autocomplete="new-password" data-i18n-placeholder="new_password" placeholder="New password" />
                <button type="submit" data-i18n="change_password">Change password</button>
                <p className="error" id="adminPasswordError"></p>
            </form>

            <h4 data-i18n="admin_server_title">Server and privacy</h4>
            <table className="table compact">
                <tbody>
                    <tr>
                        <td>OUTBOUND_PROXY</td>
                        <td>
                            {s.outboundProxy || <span className="badge warn">direct</span>}
                            {s.outboundRequired ? <span className="badge ok">required</span> : null}
                            {s.egress ? (
                                <div className="small">
                                    {s.egress.ok
                                        ? <>{s.egress.warp ? <span className="badge ok">WARP on</span> : <span className="badge warn">WARP off</span>} IP {s.egress.ip}{s.egress.colo ? ` (${s.egress.colo})` : ''}</>
                                        : <span className="badge err">{s.egress.error}</span>}
                                    {' · '}{date(s.egress.checkedAt)}
                                </div>
                            ) : null}
                        </td>
                    </tr>
                    <tr><td>PUBLIC_BASE_URL</td><td>{s.publicBaseUrl || <span className="badge warn">not set</span>}</td></tr>
                    <tr><td>ORIGIN_SECRET (Cloudflare)</td><td>{s.originProtected ? <span className="badge ok">on</span> : <span className="badge warn">off</span>}</td></tr>
                    <tr><td>STREAM_MASKING</td><td>{s.streamMasking ? <span className="badge ok">on</span> : <span className="badge warn">off</span>}</td></tr>
                    <tr><td>ALLOW_LEGACY_URLS</td><td>{s.legacyUrls ? 'on' : 'off'}</td></tr>
                    <tr><td>ALLOW_PRIVATE_URLS</td><td>{s.privateUrls ? <span className="badge warn">on</span> : 'off'}</td></tr>
                </tbody>
            </table>
        </div>
    );
}

export function AdminPage(props: AdminProps) {
    const st = props.stats;
    return (
        <Layout page="admin" title="Admin">
            <div className="card">
                <div className="row spread">
                    <h2 data-i18n="admin_title">Administration</h2>
                    <button type="button" className="secondary" data-action="admin-logout" data-i18n="logout">LOG OUT</button>
                </div>
                <div className="stats">
                    <div><strong>{props.configs.length}</strong><span data-i18n="admin_configs">Configurations</span></div>
                    <div><strong>{props.epg.length}</strong><span data-i18n="admin_epg_short">EPG sources</span></div>
                    <div><strong>{st.programs}</strong><span data-i18n="admin_col_programs">Programmes</span></div>
                    <div><strong>{props.playlists.length}</strong><span data-i18n="admin_playlists_short">Playlists</span></div>
                    <div><strong>{st.memoryMb} MB</strong><span>RAM</span></div>
                    <div><strong>{st.uptime}</strong><span>uptime</span></div>
                    <div><strong>{st.dbKind}</strong><span>DB</span></div>
                </div>
            </div>
            <ConfigsTable configs={props.configs} />
            <EpgTable epg={props.epg} queued={props.queued} />
            <PlaylistTable playlists={props.playlists} />
            <SettingsCard s={props.settings} />
        </Layout>
    );
}
