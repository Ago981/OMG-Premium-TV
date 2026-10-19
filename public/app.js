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
                document.dispatchEvent(new Event('omg:language'));
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
    var PRESETS = window.OMG_PRESETS || { countries: [], thematic: [] };

    function flag(iso) {
        if (!/^[a-z]{2}$/i.test(iso)) return '';
        return iso.toUpperCase().split('').map(function (c) { return String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65); }).join('');
    }

    /** Nome del paese nella lingua dell'interfaccia (Intl.DisplayNames), con ripiego sul codice. */
    function countryName(iso) {
        try {
            return new Intl.DisplayNames([lang], { type: 'region' }).of(iso.toUpperCase()) || iso.toUpperCase();
        } catch (e) {
            return iso.toUpperCase();
        }
    }

    function sortedCountries(filter) {
        return PRESETS.countries.filter(filter || function () { return true; })
            .map(function (c) { return { c: c, name: countryName(c.iso) }; })
            .sort(function (a, b) { return a.name.localeCompare(b.name, lang); });
    }

    var CONFIG_FIELDS = ['label', 'country', 'source_type', 'm3u', 'xtream_server', 'xtream_username', 'xtream_password', 'xtream_format', 'xtream_vod', 'tmdb_api_key', 'epg', 'epg_enabled', 'smart_epg', 'language', 'proxy_type', 'proxy', 'proxy_pwd', 'force_proxy', 'mask_streams',
        'aio_compatible', 'id_suffix', 'remapper_path', 'update_interval', 'python_script_url', 'python_update_interval',
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

        // ---- paese e preset
        var countrySel = $('#countrySelect');
        var epgSel = $('#epgPresetSelect');

        function fillCountrySelect() {
            var current = countrySel.value || countrySel.getAttribute('data-value') || '';
            countrySel.querySelectorAll('option[data-code]').forEach(function (o) { o.remove(); });
            sortedCountries().forEach(function (item) {
                var o = document.createElement('option');
                o.value = item.c.code;
                o.setAttribute('data-code', item.c.code);
                o.textContent = flag(item.c.iso) + ' ' + item.name + (item.c.epg.length ? '' : ' ·');
                countrySel.appendChild(o);
            });
            countrySel.value = current;
        }

        function fillEpgSelect() {
            epgSel.innerHTML = '';
            var g1 = document.createElement('optgroup');
            g1.label = t('epg_country_group');
            sortedCountries(function (c) { return c.epg.length > 0; }).forEach(function (item) {
                var o = document.createElement('option');
                o.value = 'c:' + item.c.code;
                o.textContent = flag(item.c.iso) + ' ' + item.name + (item.c.epg.length > 1 ? ' (' + item.c.epg.length + ')' : '');
                g1.appendChild(o);
            });
            var g2 = document.createElement('optgroup');
            g2.label = t('epg_thematic_group');
            PRESETS.thematic.forEach(function (th) {
                var o = document.createElement('option');
                o.value = 't:' + th.id;
                o.textContent = th.name;
                g2.appendChild(o);
            });
            epgSel.appendChild(g1);
            epgSel.appendChild(g2);
            syncEpgPreset();
        }

        function presetFor(code) {
            for (var i = 0; i < PRESETS.countries.length; i++) if (PRESETS.countries[i].code === code) return PRESETS.countries[i];
            return null;
        }

        /** Il preset EPG proposto segue il paese scelto. */
        function syncEpgPreset() {
            var p = presetFor(countrySel.value);
            if (p && p.epg.length) epgSel.value = 'c:' + p.code;
            var info = $('#epgFallbackInfo');
            if (info) {
                info.textContent = t('epg_fallback_hint') + (p && p.epg.length ? ' ' + t('epg_country_default').replace('{country}', countryName(p.iso)) : '');
            }
        }

        fillCountrySelect();
        fillEpgSelect();
        countrySel.addEventListener('change', syncEpgPreset);
        document.addEventListener('omg:language', function () { fillCountrySelect(); fillEpgSelect(); });

        if (form.proxy && form.force_proxy) {
            form.proxy.addEventListener('input', function () {
                if (form.proxy.value.trim() && mode === 'new') {
                    form.force_proxy.checked = true;
                }
            });
        }

        // ---- wizard
        var steps = Array.prototype.slice.call(form.querySelectorAll('.step'));
        var stepButtons = Array.prototype.slice.call(document.querySelectorAll('#stepper [data-goto]'));
        var current = 0;
        var reached = mode === 'edit' ? steps.length - 1 : 0;

        function stepValid(index) {
            var fields = steps[index].querySelectorAll('input, select, textarea');
            for (var i = 0; i < fields.length; i++) {
                if (!fields[i].checkValidity()) { fields[i].reportValidity(); return false; }
            }
            return true;
        }

        // ---- sorgente: M3U oppure account Xtream (solo i campi visibili sono obbligatori)
        function sourceType() {
            return form.elements.source_type ? form.elements.source_type.value || 'm3u' : 'm3u';
        }

        function syncSource() {
            var type = sourceType();
            form.querySelectorAll('.source-panel').forEach(function (panel) {
                var on = panel.getAttribute('data-source') === type;
                panel.classList.toggle('hidden', !on);
                panel.querySelectorAll('input[name="m3u"], input[name="xtream_server"], input[name="xtream_username"], input[name="xtream_password"]').forEach(function (el) {
                    el.required = on;
                });
            });
            // Film e serie: la chiave TMDB è obbligatoria solo se l'opzione è attiva
            var vod = form.elements.xtream_vod;
            if (vod) {
                var vodOn = type === 'xtream' && vod.checked;
                $('.vod-fields').classList.toggle('hidden', !vod.checked);
                form.elements.tmdb_api_key.required = vodOn;
            }
        }

        if (form.elements.source_type) {
            Array.prototype.forEach.call(form.querySelectorAll('input[name="source_type"]'), function (r) {
                r.addEventListener('change', syncSource);
            });
            if (form.elements.xtream_vod) form.elements.xtream_vod.addEventListener('change', syncSource);
            syncSource();
            form.addEventListener('omg:source', syncSource);
        }

        function showStep(index) {
            current = Math.max(0, Math.min(index, steps.length - 1));
            reached = Math.max(reached, current);
            steps.forEach(function (st, i) { st.classList.toggle('active', i === current); });
            stepButtons.forEach(function (b, i) {
                b.classList.toggle('active', i === current);
                b.classList.toggle('done', i < current || (mode === 'edit' && i !== current));
                b.disabled = i > reached;
            });
            var last = current === steps.length - 1;
            $('[data-action="prev"]').style.visibility = current === 0 ? 'hidden' : 'visible';
            $('[data-action="next"]').style.display = last ? 'none' : '';
            $('.submit-btn').style.display = last || mode === 'edit' ? '' : 'none';
            if (steps[current].getAttribute('data-step') === 'confirm') renderSummary();
            clearError($('#configError'));
        }

        function stepOfField(name) {
            var el = form.elements[name];
            var node = el && (el.length && !el.tagName ? el[0] : el);
            var section = node && node.closest ? node.closest('.step') : null;
            return section ? steps.indexOf(section) : -1;
        }

        function renderSummary() {
            var d = readConfig(form);
            var p = presetFor(d.country);
            var epgText = !d.epg_enabled ? t('no') : (d.epg ? d.epg.split(',').length + ' URL' : (p && p.epg.length ? t('summary_epg_auto') : 'url-tvg'));
            var rows = [
                [t('country'), p ? flag(p.iso) + ' ' + countryName(p.iso) : '—'],
                d.source_type === 'xtream'
                    ? ['Xtream', (d.xtream_server.replace(/^https?:\/\//, '').split('/')[0] || '—') + ' · ' + d.xtream_username + ' · ' + d.xtream_format +
                        (d.xtream_vod ? ' · ' + t('summary_vod') : '')]
                    : ['M3U', d.m3u.split(',').filter(Boolean).length + ' URL'],
                ['EPG', epgText],
                ['Proxy', d.proxy && d.proxy_pwd ? (d.proxy_type === 'auto' ? t('proxy_type_auto') : d.proxy_type) + ' — ' + t('summary_proxy_all') : t('summary_proxy_none')],
                [t('mask_streams'), d.mask_streams ? t('yes') : t('no')],
                [t('update_interval'), d.update_interval || '12:00']
            ];
            $('#configSummary').innerHTML = '<h3>' + escapeHtml(t('summary_title')) + '</h3>' + statusTable(rows);
        }

        stepButtons.forEach(function (b, i) {
            b.addEventListener('click', function () {
                if (mode === 'new' && i > current && !stepValid(current)) return;
                showStep(i);
            });
        });
        showStep(0);

        var vodTimer = null;
        var actions = {
            prev: function () { showStep(current - 1); },
            next: function () { if (stepValid(current)) showStep(current + 1); },
            'xtream-test': function () {
                var out = $('#xtreamTestResult');
                out.textContent = t('loader_default');
                out.className = 'small muted';
                api('POST', '/api/xtream-test', {
                    xtream_server: form.xtream_server.value.trim(),
                    xtream_username: form.xtream_username.value.trim(),
                    xtream_password: form.xtream_password.value
                }).then(function (d) {
                    if (!d.success) {
                        out.textContent = '❌ ' + errorText(d.message);
                        out.className = 'small error-text';
                        return;
                    }
                    // Se è stato incollato il link completo, i campi vengono separati
                    form.xtream_server.value = d.server;
                    if (!form.xtream_username.value) form.xtream_username.value = d.username;
                    if (!form.xtream_password.value) form.xtream_password.value = d.password;
                    var parts = ['✅ ' + t('xtream_status') + ': ' + d.accountStatus];
                    parts.push(t('xtream_expires') + ': ' + (d.expDate ? new Date(d.expDate).toLocaleDateString(lang) : t('xtream_never')));
                    if (d.maxConnections !== null) parts.push(t('xtream_connections') + ': ' + (d.activeConnections || 0) + '/' + d.maxConnections);
                    if (d.isTrial) parts.push('trial');
                    out.textContent = parts.join(' · ');
                    out.className = 'small ok-text';
                });
            },
            'tmdb-test': function () {
                var out = $('#tmdbTestResult');
                out.textContent = t('loader_default');
                out.className = 'small muted';
                api('POST', '/api/tmdb-test', { tmdb_api_key: form.tmdb_api_key.value.trim() }).then(function (d) {
                    out.textContent = d.success ? '✅ ' + t('tmdb_test_ok') : '❌ ' + errorText(d.message);
                    out.className = d.success ? 'small ok-text' : 'small error-text';
                });
            },
            'vod-status': function () {
                var out = $('#vodStatus');
                if (!out) return;
                api('GET', '/api/configs/' + form.getAttribute('data-id') + '/vod').then(function (d) {
                    if (!d.success || !d.enabled) { out.textContent = ''; return; }
                    var busy = ['queued', 'syncing', 'matching'].indexOf(d.vodStatus) >= 0;
                    var parts = [t('vod_status_' + d.vodStatus)];
                    parts.push(t('vod_movies') + ': ' + d.movies, t('vod_series') + ': ' + d.series);
                    parts.push(t('vod_matched') + ': ' + d.matched + ' / ' + (d.matched + d.unmatched + d.pending));
                    if (d.updatedAt) parts.push(t('vod_updated') + ' ' + new Date(d.updatedAt).toLocaleString(lang));
                    if (d.vodStatus === 'error' && d.lastError) parts.push(errorText(d.lastError));
                    out.textContent = parts.join(' · ');
                    out.className = d.vodStatus === 'error' ? 'small error-text' : 'small muted';
                    clearTimeout(vodTimer);
                    if (busy) vodTimer = setTimeout(actions['vod-status'], 4000);
                });
            },
            'vod-refresh': function () {
                api('POST', '/api/configs/' + form.getAttribute('data-id') + '/vod', {}).then(function (d) {
                    if (!d.success) { toast(errorText(d.message), 'error'); return; }
                    toast(t('vod_refresh_started'));
                    actions['vod-status']();
                });
            },
            'use-country-playlist': function () {
                var p = presetFor(countrySel.value);
                if (!p) { countrySel.reportValidity(); return; }
                if (!p.m3u) { toast(t('no_country_playlist'), 'error'); return; }
                if (form.elements.source_type) { form.elements.source_type.value = 'm3u'; syncSource(); }
                if (form.m3u.readOnly) return;
                var list = form.m3u.value.split(',').map(function (u) { return u.trim(); }).filter(Boolean);
                if (list.indexOf(p.m3u) < 0) list.push(p.m3u);
                form.m3u.value = list.join(',');
                if (p.epg.length && !form.epg.value) form.epg_enabled.checked = true;
                syncEpgPreset();
            },
            'add-epg-preset': function () {
                var v = epgSel.value || '';
                var urls = [];
                if (v.indexOf('c:') === 0) urls = (presetFor(v.slice(2)) || { epg: [] }).epg;
                if (v.indexOf('t:') === 0) PRESETS.thematic.forEach(function (th) { if ('t:' + th.id === v) urls = [th.url]; });
                var list = form.epg.value.split(',').map(function (u) { return u.trim(); }).filter(Boolean);
                urls.forEach(function (u) { if (list.indexOf(u) < 0) list.push(u); });
                form.epg.value = list.join(',');
                form.epg_enabled.checked = true;
                toast(t('epg_preset_added'));
            },
            'proxy-test': function () {
                var out = $('#proxyTestResult');
                out.textContent = t('loader_default');
                out.className = 'small muted';
                api('POST', '/api/proxy-test', { proxy: form.proxy.value.trim(), proxy_pwd: form.proxy_pwd.value }).then(function (d) {
                    if (d.success) {
                        out.textContent = '✅ ' + d.label + (d.version ? ' ' + d.version : '') + ' — ' + t('proxy_test_ok') +
                            (d.ip ? ' · ' + t('proxy_exit_ip') + ' ' + d.ip : '');
                        out.className = 'small ok-text';
                    } else if (d.reachable && !d.authOk) {
                        out.textContent = '❌ ' + d.label + ': ' + t('proxy_test_badpwd');
                        out.className = 'small error-text';
                    } else {
                        out.textContent = '❌ ' + (d.message ? errorText(d.message) : t('proxy_test_fail'));
                        out.className = 'small error-text';
                    }
                });
            },
            'copy-manifest': function () {
                var url = $('#manifestUrl').textContent.trim();
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(url).then(function () {
                        toast(t('toast_copied'));
                    }).catch(function () {
                        copyFallback(url);
                    });
                } else {
                    copyFallback(url);
                }
                function copyFallback(text) {
                    var ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.focus();
                    ta.select();
                    try {
                        document.execCommand('copy');
                        toast(t('toast_copied'));
                    } catch (e) {
                        prompt(t('copy_manifest'), text);
                    }
                    document.body.removeChild(ta);
                }
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
                    if (form.elements.source_type) form.dispatchEvent(new Event('omg:source'));
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
            for (var i = 0; i < steps.length; i++) {
                if (mode === 'edit' || i <= current) {
                    var bad = steps[i].querySelector(':invalid');
                    if (bad) { showStep(i); bad.reportValidity(); return; }
                }
            }
            var data = readConfig(form);
            function fail(message) {
                var field = String(message || '').split(':')[1];
                var idx = field ? stepOfField(field) : -1;
                if (idx >= 0) showStep(idx);
                showError(err, message);
            }
            if (mode === 'new') {
                data.password = form.password.value;
                data.confirm = form.confirm.value;
                if (data.password !== data.confirm) return showError(err, 'password_mismatch');
                showLoader(t('loader_creating'));
                api('POST', '/api/configs', data).then(function (d) {
                    hideLoader();
                    if (d.success) location.href = d.configureUrl; else fail(d.message);
                });
            } else {
                showLoader(t('loader_saving'));
                api('PUT', base, data).then(function (d) {
                    hideLoader();
                    if (d.success) { toast(t('config_saved')); setTimeout(actions['vod-status'], 500); } else fail(d.message);
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
            if ($('#vodStatus') && form.elements.xtream_vod && form.elements.xtream_vod.checked) {
                actions['vod-status']();
                document.addEventListener('omg:language', actions['vod-status']);
            }
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
