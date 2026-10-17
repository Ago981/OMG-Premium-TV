/* OMG TV — script delle pagine (nessuno script inline: compatibile con la Content-Security-Policy). */
(function () {
    'use strict';

    // ------------------------------------------------------------ i18n
    var I18N = window.I18N || { en: {} };
    var saved = null;
    try { saved = localStorage.getItem('omg_tv_lang'); } catch (e) { /* storage non disponibile */ }
    var browser = (navigator.language || 'en').slice(0, 2);
    var lang = saved || (I18N[browser] ? browser : 'en');

    function t(key) {
        var L = I18N[lang] || I18N.en;
        return (L && L[key]) || (I18N.en && I18N.en[key]) || key;
    }

    function applyLanguage(code) {
        lang = I18N[code] ? code : 'en';
        document.documentElement.lang = lang;
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var v = I18N[lang] && I18N[lang][el.getAttribute('data-i18n')];
            if (!v) return;
            if (el.tagName === 'INPUT') el.value = v; else el.textContent = v;
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
            var v = I18N[lang] && I18N[lang][el.getAttribute('data-i18n-placeholder')];
            if (v) el.placeholder = v;
        });
        document.querySelectorAll('[data-lang]').forEach(function (a) {
            a.classList.toggle('active', a.getAttribute('data-lang') === lang);
        });
    }

    // ------------------------------------------------------------ utilità
    function $(sel, root) { return (root || document).querySelector(sel); }

    function api(method, url, body) {
        return fetch(url, {
            method: method,
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body)
        }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (data) {
                if (!r.ok && data.success === undefined) data.success = false;
                data.status = r.status;
                return data;
            });
        });
    }

    /** Messaggi di errore del server: chiavi i18n (es. invalid_url:m3u) o testo libero. */
    function errorText(message) {
        if (!message) return t('error_generic');
        var key = 'err_' + String(message).split(':')[0];
        var text = t(key);
        if (text === key) return String(message);
        var field = String(message).split(':')[1];
        return field ? text + ' (' + field + ')' : text;
    }

    function showError(el, message) {
        if (!el) { alert(errorText(message)); return; }
        el.textContent = errorText(message);
        el.style.display = 'block';
    }

    function clearError(el) { if (el) { el.textContent = ''; el.style.display = 'none'; } }

    var toastTimer;
    function toast(message, kind) {
        var el = $('#toast');
        if (!el) return;
        el.textContent = message;
        el.className = 'toast show' + (kind === 'error' ? ' error' : '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.className = 'toast'; }, 2500);
    }

    function showLoader(message) {
        $('#loaderMessage').textContent = message || t('loader_default');
        $('#loaderOverlay').style.display = 'flex';
    }
    function hideLoader() { $('#loaderOverlay').style.display = 'none'; }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function statusTable(rows) {
        return '<table class="table compact">' + rows.filter(Boolean).map(function (r) {
            return '<tr><td><strong>' + escapeHtml(r[0]) + '</strong></td><td' + (r[2] ? ' class="error-text"' : '') + '>' + escapeHtml(r[1]) + '</td></tr>';
        }).join('') + '</table>';
    }

    // ------------------------------------------------------------ comuni
    function initCommon() {
        document.querySelectorAll('[data-lang]').forEach(function (a) {
            a.addEventListener('click', function (e) {
                e.preventDefault();
                var code = a.getAttribute('data-lang');
                try { localStorage.setItem('omg_tv_lang', code); } catch (err) { /* ignore */ }
                applyLanguage(code);
            });
        });
        document.querySelectorAll('[data-toggle]').forEach(function (header) {
            header.addEventListener('click', function () {
                var content = document.getElementById(header.getAttribute('data-toggle'));
                if (!content) return;
                content.classList.toggle('show');
                var icon = header.querySelector('.toggle-icon');
                if (icon) icon.textContent = content.classList.contains('show') ? '▲' : '▼';
            });
        });
        applyLanguage(lang);
    }

    // ------------------------------------------------------------ home / login
    function initHome() {
        var form = $('#openConfigForm');
        if (!form) return;
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var err = $('#openConfigError');
            clearError(err);
            var id = form.id.value.trim();
            // Accetta anche l'URL completo del manifest
            var m = id.match(/\/c\/([\w-]+)\//);
            if (m) id = m[1];
            api('POST', '/api/configs/' + encodeURIComponent(id) + '/login', { password: form.password.value }).then(function (d) {
                if (d.success) location.href = d.configureUrl; else showError(err, d.message);
            });
        });
    }

    function initGate() {
        var form = $('#gateForm');
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            api('POST', '/api/gate', { password: form.password.value }).then(function (d) {
                if (d.success) location.href = form.getAttribute('data-return') || '/new';
                else showError($('#gateError'), d.message);
            });
        });
    }

    function initConfigLogin() {
        var form = $('#configLoginForm');
        if (!form) return;
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var id = form.getAttribute('data-id');
            api('POST', '/api/configs/' + encodeURIComponent(id) + '/login', { password: form.password.value }).then(function (d) {
                if (d.success) location.reload(); else showError($('#configLoginError'), d.message);
            });
        });
    }

    // ------------------------------------------------------------ editor configurazione
    var PRESET_COUNTRIES = [
        ['Albania', 'al'], ['Argentina', 'ar'], ['Armenia', 'am'], ['Australia', 'au'], ['Austria', 'at'], ['Belarus', 'by'],
        ['Belgium', 'be'], ['Bolivia', 'bo'], ['Bosnia and Herzegovina', 'ba'], ['Brazil', 'br'], ['Bulgaria', 'bg'], ['Canada', 'ca'],
        ['Chile', 'cl'], ['Colombia', 'co'], ['Costa Rica', 'cr'], ['Croatia', 'hr'], ['Czech Republic', 'cz'], ['Denmark', 'dk'],
        ['Dominican Republic', 'do'], ['Ecuador', 'ec'], ['Egypt', 'eg'], ['El Salvador', 'sv'], ['Finland', 'fi'], ['France', 'fr'],
        ['Georgia', 'ge'], ['Germany', 'de'], ['Ghana', 'gh'], ['Greece', 'gr'], ['Guatemala', 'gt'], ['Honduras', 'hn'],
        ['Hong Kong', 'hk'], ['Hungary', 'hu'], ['Iceland', 'is'], ['India', 'in'], ['Indonesia', 'id'], ['Israel', 'il'],
        ['Italy', 'it'], ['Japan', 'jp'], ['Latvia', 'lv'], ['Lebanon', 'lb'], ['Lithuania', 'lt'], ['Luxembourg', 'lu'],
        ['North Macedonia', 'mk'], ['Malaysia', 'my'], ['Malta', 'mt'], ['Mexico', 'mx'], ['Montenegro', 'me'], ['Netherlands', 'nl'],
        ['New Zealand', 'nz'], ['Nicaragua', 'ni'], ['Nigeria', 'ng'], ['Norway', 'no'], ['Panama', 'pa'], ['Paraguay', 'py'],
        ['Peru', 'pe'], ['Philippines', 'ph'], ['Poland', 'pl'], ['Portugal', 'pt'], ['Romania', 'ro'], ['Russia', 'ru'],
        ['Saudi Arabia', 'sa'], ['Serbia', 'rs'], ['Singapore', 'sg'], ['Slovenia', 'si'], ['South Africa', 'za'], ['South Korea', 'kr'],
        ['Spain', 'es'], ['Sweden', 'se'], ['Switzerland', 'ch'], ['Taiwan', 'tw'], ['Thailand', 'th'], ['Turkey', 'tr'],
        ['Uganda', 'ug'], ['Ukraine', 'ua'], ['United Arab Emirates', 'ae'], ['United Kingdom', 'gb'], ['United States', 'us'], ['Uruguay', 'uy'],
        ['Venezuela', 've'], ['Vietnam', 'vn'], ['Zimbabwe', 'zw']
    ];

    function flag(code) {
        return code.toUpperCase().split('').map(function (c) { return String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65); }).join('');
    }

    var CONFIG_FIELDS = ['label', 'm3u', 'epg', 'epg_enabled', 'language', 'proxy', 'proxy_pwd', 'force_proxy', 'mask_streams',
        'id_suffix', 'remapper_path', 'update_interval', 'python_script_url', 'python_update_interval',
        'resolver_script', 'resolver_enabled', 'resolver_update_interval'];

    /** Legge tutti i campi della configurazione (anche quelli fuori dal form con form="configForm"). */
    function readConfig(form) {
        var out = {};
        CONFIG_FIELDS.forEach(function (name) {
            var el = form.elements[name];
            if (!el) return;
            out[name] = el.type === 'checkbox' ? el.checked : el.value.trim();
        });
        return out;
    }

    function fillConfig(form, data) {
        Object.keys(data).forEach(function (name) {
            var el = form.elements[name];
            if (!el || el.readOnly || name === 'password' || name === 'confirm') return;
            if (el.type === 'checkbox') el.checked = data[name] === true || data[name] === 'true';
            else el.value = data[name] == null ? '' : data[name];
        });
    }

    function initEditor() {
        var form = $('#configForm');
        var mode = form.getAttribute('data-mode');
        var id = form.getAttribute('data-id');
        var base = '/api/configs/' + encodeURIComponent(id);

        var sel = $('#presetCountry');
        PRESET_COUNTRIES.forEach(function (c) {
            var o = document.createElement('option');
            o.value = c[1];
            o.textContent = flag(c[1]) + ' ' + c[0];
            sel.appendChild(o);
        });

        var actions = {
            preset: function () {
                if (!sel.value) return;
                if (!form.m3u.readOnly) form.m3u.value = 'https://iptv-org.github.io/iptv/countries/' + sel.value + '.m3u';
                form.epg.value = 'https://iptv-epg.org/files/epg-' + sel.value + '.xml';
                form.epg_enabled.checked = true;
            },
            'copy-manifest': function () {
                var url = $('#manifestUrl').textContent.trim();
                navigator.clipboard.writeText(url).then(function () { toast(t('toast_copied')); });
            },
            install: function () {
                var url = $('#manifestUrl').textContent.trim();
                location.href = url.replace(/^https?:\/\//, 'stremio://');
            },
            backup: function () {
                var data = readConfig(form);
                data.config_id = id;
                var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                var a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'omg_tv_config.json';
                a.click();
                URL.revokeObjectURL(a.href);
            },
            restore: function () { $('#restoreFile').click(); },
            logout: function () {
                api('POST', base + '/logout', {}).then(function () { location.href = '/'; });
            },
            'delete-config': function () {
                var pwd = prompt(t('delete_confirm_password'));
                if (!pwd) return;
                api('DELETE', base, { password: pwd }).then(function (d) {
                    if (d.success) { alert(t('config_deleted')); location.href = '/'; } else alert(errorText(d.message));
                });
            },
            'python-download': function () {
                showLoader(t('loader_download_script'));
                api('POST', base + '/python', { action: 'download', url: form.elements.python_script_url.value.trim() }).then(function (d) {
                    hideLoader();
                    if (d.success) toast(t('success_script_downloaded')); else alert(errorText(d.message));
                    actions['python-status']();
                });
            },
            'python-execute': function () {
                showLoader(t('loader_execute_script'));
                api('POST', base + '/python', { action: 'execute' }).then(function (d) {
                    hideLoader();
                    if (d.success) { toast(t('success_script_executed')); showGenerated(d.m3uUrl); } else alert(errorText(d.message));
                    actions['python-status']();
                });
            },
            'python-status': function () {
                api('POST', base + '/python', { action: 'status' }).then(function (d) {
                    if (d.status >= 400) return;
                    var box = $('#pythonStatus');
                    box.classList.remove('hidden');
                    $('#pythonStatusContent').innerHTML = statusTable([
                        [t('running'), d.isRunning ? t('yes') : t('no')],
                        [t('last_run'), d.lastExecution],
                        [t('script_exists'), d.scriptExists ? t('yes') : t('no')],
                        [t('m3u_exists'), d.m3uExists ? t('yes') : t('no')],
                        d.scheduledUpdates ? [t('auto_update'), t('auto_update_active') + ' ' + d.updateInterval] : null,
                        d.lastError ? [t('last_error'), d.lastError, true] : null
                    ]);
                    if (d.m3uUrl) showGenerated(d.m3uUrl);
                });
            },
            'python-use': function () {
                var url = $('#m3uUrlContent').textContent.trim();
                if (!form.m3u.readOnly) form.m3u.value = url;
                toast(t('success_playlist_set'));
                form.m3u.scrollIntoView({ behavior: 'smooth', block: 'center' });
            },
            'resolver-download': function () {
                showLoader(t('loader_download_resolver'));
                api('POST', base + '/resolver', { action: 'download', url: form.elements.resolver_script.value.trim() }).then(function (d) {
                    hideLoader();
                    if (d.success) { toast(t('success_resolver_downloaded')); form.elements.resolver_enabled.checked = true; } else alert(errorText(d.message));
                    actions['resolver-status']();
                });
            },
            'resolver-check': function () {
                api('POST', base + '/resolver', { action: 'check' }).then(function (d) {
                    alert(d.success ? '✅ ' + t('success_resolver_verified') : '❌ ' + errorText(d.message));
                    actions['resolver-status']();
                });
            },
            'resolver-clear': function () {
                api('POST', base + '/resolver', { action: 'clear' }).then(function () {
                    toast(t('success_cache_cleared'));
                    actions['resolver-status']();
                });
            },
            'resolver-status': function () {
                api('POST', base + '/resolver', { action: 'status' }).then(function (d) {
                    if (d.status >= 400) return;
                    $('#resolverStatus').classList.remove('hidden');
                    $('#resolverStatusContent').innerHTML = statusTable([
                        [t('running'), d.isRunning ? t('yes') : t('no')],
                        [t('last_run'), d.lastExecution],
                        [t('script_exists'), d.scriptExists ? t('yes') : t('no')],
                        [t('version'), d.resolverVersion],
                        [t('cache_items'), d.cacheItems],
                        d.scheduledUpdates ? [t('auto_update'), t('auto_update_active') + ' ' + d.updateInterval] : null,
                        d.lastError ? [t('last_error'), d.lastError, true] : null
                    ]);
                });
            }
        };

        function showGenerated(url) {
            $('#generatedM3uUrl').classList.remove('hidden');
            $('#m3uUrlContent').textContent = url;
        }

        document.querySelectorAll('[data-action]').forEach(function (btn) {
            var fn = actions[btn.getAttribute('data-action')];
            if (fn) btn.addEventListener('click', fn);
        });

        $('#restoreFile') && $('#restoreFile').addEventListener('change', function (e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function () {
                try {
                    fillConfig(form, JSON.parse(reader.result));
                    toast(t('restore_done'));
                } catch (err) {
                    alert(t('error_load_config') + err.message);
                }
            };
            reader.readAsText(file);
        });

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var err = $('#configError');
            clearError(err);
            var data = readConfig(form);
            if (mode === 'new') {
                data.password = form.password.value;
                data.confirm = form.confirm.value;
                if (data.password !== data.confirm) return showError(err, 'password_mismatch');
                showLoader(t('loader_creating'));
                api('POST', '/api/configs', data).then(function (d) {
                    hideLoader();
                    if (d.success) location.href = d.configureUrl; else showError(err, d.message);
                });
            } else {
                showLoader(t('loader_saving'));
                api('PUT', base, data).then(function (d) {
                    hideLoader();
                    if (d.success) toast(t('config_saved')); else showError(err, d.message);
                });
            }
        });

        var pwdForm = $('#passwordForm');
        if (pwdForm) {
            pwdForm.addEventListener('submit', function (e) {
                e.preventDefault();
                var perr = $('#passwordError');
                clearError(perr);
                if (pwdForm.password.value !== pwdForm.confirm.value) return showError(perr, 'password_mismatch');
                api('POST', base + '/password', {
                    current: pwdForm.current.value, password: pwdForm.password.value, confirm: pwdForm.confirm.value
                }).then(function (d) {
                    if (d.success) { pwdForm.reset(); toast(t('password_changed')); } else showError(perr, d.message);
                });
            });
        }

        if (mode === 'edit') {
            if ($('#pythonStatus') && form.elements.python_script_url && form.elements.python_script_url.value) actions['python-status']();
            if ($('#resolverStatus') && form.elements.resolver_script && form.elements.resolver_script.value) actions['resolver-status']();
        }
    }

    // ------------------------------------------------------------ admin
    function initAdminLogin() {
        var form = $('#adminLoginForm');
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            api('POST', '/api/admin/login', { password: form.password.value }).then(function (d) {
                if (d.success) location.reload(); else showError($('#adminLoginError'), d.message);
            });
        });
    }

    function initAdmin() {
        var rows = Array.prototype.slice.call(document.querySelectorAll('#configsTable tbody tr'));

        function selected() {
            return Array.prototype.slice.call(document.querySelectorAll('.row-select:checked')).map(function (c) { return c.value; });
        }

        function deleteIds(ids) {
            if (!ids.length) return alert(t('admin_nothing_selected'));
            if (!confirm(t('admin_delete_confirm').replace('{n}', ids.length))) return;
            api('POST', '/api/admin/configs/delete', { ids: ids }).then(function (d) {
                if (d.success) { toast(t('admin_deleted').replace('{n}', d.deleted)); setTimeout(function () { location.reload(); }, 600); }
                else alert(errorText(d.message));
            });
        }

        $('#selectAll').addEventListener('change', function (e) {
            rows.forEach(function (r) { if (r.style.display !== 'none') r.querySelector('.row-select').checked = e.target.checked; });
        });

        $('#configFilter').addEventListener('input', function (e) {
            var q = e.target.value.trim().toLowerCase();
            rows.forEach(function (r) { r.style.display = !q || r.getAttribute('data-search').indexOf(q) >= 0 ? '' : 'none'; });
        });

        var actions = {
            'admin-delete-selected': function () { deleteIds(selected()); },
            'admin-delete-one': function (btn) { deleteIds([btn.getAttribute('data-id')]); },
            'admin-select-inactive': function () {
                var limit = Date.now() - 30 * 24 * 60 * 60 * 1000;
                rows.forEach(function (r) { r.querySelector('.row-select').checked = Number(r.getAttribute('data-last')) < limit; });
            },
            'admin-epg-refresh': function (btn) {
                api('POST', '/api/admin/epg/' + btn.getAttribute('data-id') + '/refresh', {}).then(function () { toast(t('admin_epg_queued')); });
            },
            'admin-epg-delete': function (btn) {
                if (!confirm(t('admin_epg_delete_confirm'))) return;
                api('DELETE', '/api/admin/epg/' + btn.getAttribute('data-id'), {}).then(function () { location.reload(); });
            },
            'admin-logout': function () {
                api('POST', '/api/admin/logout', {}).then(function () { location.href = '/admin'; });
            }
        };
        document.querySelectorAll('[data-action]').forEach(function (btn) {
            var fn = actions[btn.getAttribute('data-action')];
            if (fn) btn.addEventListener('click', function () { fn(btn); });
        });

        var sform = $('#adminSettingsForm');
        sform.addEventListener('submit', function (e) {
            e.preventDefault();
            api('POST', '/api/admin/settings', {
                gate_enabled: sform.gate_enabled.checked,
                gate_password: sform.gate_password.value,
                python_enabled: sform.python_enabled.checked
            }).then(function (d) {
                if (d.success) { sform.gate_password.value = ''; toast(t('config_saved')); } else showError($('#adminSettingsError'), d.message);
            });
        });

        var pform = $('#adminPasswordForm');
        pform.addEventListener('submit', function (e) {
            e.preventDefault();
            api('POST', '/api/admin/password', { current: pform.current.value, password: pform.password.value }).then(function (d) {
                if (d.success) { pform.reset(); toast(t('password_changed')); } else showError($('#adminPasswordError'), d.message);
            });
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        initCommon();
        var page = document.body.getAttribute('data-page');
        if (page === 'home') initHome();
        if (page === 'gate') initGate();
        if (page === 'config-login') initConfigLogin();
        if (page === 'config-new' || page === 'config-edit') initEditor();
        if (page === 'admin-login') initAdminLogin();
        if (page === 'admin') initAdmin();
    });
})();
