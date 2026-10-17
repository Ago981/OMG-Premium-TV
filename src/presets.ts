/**
 * Preset per paese: playlist iptv-org e guide EPG epgshare01.
 *
 * Fonti:
 *  - playlist: https://github.com/iptv-org/iptv (countries/<codice>.m3u)
 *  - EPG: elenco mantenuto da https://github.com/Free-TV/IPTV (epglist.txt), file su epgshare01.online
 *
 * Per aggiornarli basta modificare queste tabelle. I nomi dei paesi li traduce il browser (Intl.DisplayNames).
 */

export interface CountryPreset {
    /** Codice usato da iptv-org (ISO 3166-1, tranne "uk" per il Regno Unito). */
    code: string;
    /** Codice ISO per nome e bandiera. */
    iso: string;
    m3u: string;
    epg: string[];
}

export interface ThematicEpg {
    id: string;
    name: string;
    url: string;
}

const IPTV_ORG = 'https://iptv-org.github.io/iptv/countries/';
const EPGSHARE = 'https://epgshare01.online/epgshare01/';

/** Paesi con guida EPG epgshare01 (file principali). */
const EPG_BY_COUNTRY: Record<string, string[]> = {
    al: ['epg_ripper_AL1.xml.gz'],
    ar: ['epg_ripper_AR1.xml.gz'],
    at: ['epg_ripper_AT1.xml.gz'],
    au: ['epg_ripper_AU1.xml.gz'],
    ba: ['epg_ripper_BA1.xml.gz'],
    be: ['epg_ripper_BE2.xml.gz'],
    bg: ['epg_ripper_BG1.xml.gz'],
    br: ['epg_ripper_BR1.xml.gz'],
    ca: ['epg_ripper_CA1.xml.gz'],
    ch: ['epg_ripper_CH1.xml.gz'],
    cl: ['epg_ripper_CL1.xml.gz'],
    co: ['epg_ripper_CO1.xml.gz'],
    cr: ['epg_ripper_CR1.xml.gz'],
    cy: ['epg_ripper_CY1.xml.gz'],
    cz: ['epg_ripper_CZ1.xml.gz'],
    de: ['epg_ripper_DE1.xml.gz'],
    dk: ['epg_ripper_DK1.xml.gz'],
    do: ['epg_ripper_DO1.xml.gz'],
    ec: ['epg_ripper_EC1.xml.gz'],
    eg: ['epg_ripper_EG1.xml.gz'],
    es: ['epg_ripper_ES1.xml.gz'],
    fi: ['epg_ripper_FI1.xml.gz'],
    fr: ['epg_ripper_FR1.xml.gz'],
    gr: ['epg_ripper_GR1.xml.gz'],
    hk: ['epg_ripper_HK1.xml.gz'],
    hr: ['epg_ripper_HR1.xml.gz'],
    hu: ['epg_ripper_HU1.xml.gz'],
    id: ['epg_ripper_ID1.xml.gz'],
    ie: ['epg_ripper_IE1.xml.gz'],
    il: ['epg_ripper_IL1.xml.gz'],
    in: ['epg_ripper_IN1.xml.gz', 'epg_ripper_IN4.xml.gz'],
    it: ['epg_ripper_IT1.xml.gz'],
    jm: ['epg_ripper_JM1.xml.gz'],
    jp: ['epg_ripper_JP1.xml.gz', 'epg_ripper_JP2.xml.gz'],
    ke: ['epg_ripper_KE1.xml.gz'],
    kr: ['epg_ripper_KR1.xml.gz'],
    lt: ['epg_ripper_LT1.xml.gz'],
    lv: ['epg_ripper_LV1.xml.gz'],
    mt: ['epg_ripper_MT1.xml.gz'],
    mx: ['epg_ripper_MX1.xml.gz'],
    my: ['epg_ripper_MY1.xml.gz'],
    ng: ['epg_ripper_NG1.xml.gz'],
    nl: ['epg_ripper_NL1.xml.gz'],
    no: ['epg_ripper_NO1.xml.gz'],
    nz: ['epg_ripper_NZ1.xml.gz'],
    pa: ['epg_ripper_PA1.xml.gz'],
    pe: ['epg_ripper_PE1.xml.gz'],
    ph: ['epg_ripper_PH1.xml.gz', 'epg_ripper_PH2.xml.gz'],
    pk: ['epg_ripper_PK1.xml.gz'],
    pl: ['epg_ripper_PL1.xml.gz'],
    pt: ['epg_ripper_PT1.xml.gz'],
    ro: ['epg_ripper_RO1.xml.gz', 'epg_ripper_RO2.xml.gz'],
    rs: ['epg_ripper_RS1.xml.gz'],
    sa: ['epg_ripper_SA1.xml.gz', 'epg_ripper_SA2.xml.gz'],
    se: ['epg_ripper_SE1.xml.gz'],
    sg: ['epg_ripper_SG1.xml.gz'],
    sk: ['epg_ripper_SK1.xml.gz'],
    sv: ['epg_ripper_SV1.xml.gz'],
    tr: ['epg_ripper_TR1.xml.gz', 'epg_ripper_TR3.xml.gz'],
    uk: ['epg_ripper_UK1.xml.gz'],
    us: ['epg_ripper_US1.xml.gz', 'epg_ripper_US_SPORTS1.xml.gz'],
    uy: ['epg_ripper_UY1.xml.gz'],
    vn: ['epg_ripper_VN1.xml.gz'],
    za: ['epg_ripper_ZA1.xml.gz'],
};

/** Codici paese con playlist iptv-org. */
const IPTV_ORG_COUNTRIES = 'ad ae af ag al am ao ar at au aw az ba bb bd be bf bg bh bi bj bm bn bo bq br bs bw by bz ca cd cf cg ch ci cl cm cn co cr cu cv cw cy cz de dj dk dm do dz ec ee eg eh er es et fi fj fm fo fr ga ge gf gh gl gm gn gp gq gr gt gu gy hk hn hr ht hu id ie il in iq ir is it jm jo jp ke kg kh km kn kp kr kw kz la lb lc li lk lr lt lu lv ly ma mc md me mg mk ml mm mn mo mq mr mt mu mv mw mx my mz na nc ne ng ni nl no np nz om pa pe pf pg ph pk pl pr ps pt py qa ro rs ru rw sa sd se sg si sk sl sm sn so sr st sv sx sy td tg th tj tl tm tn tr tt tw tz ua ug uk us uy uz va vc ve vg vi vn ws xk ye yt za zm zw'.split(' ');

export const COUNTRY_PRESETS: CountryPreset[] = [...new Set([...IPTV_ORG_COUNTRIES, ...Object.keys(EPG_BY_COUNTRY)])].sort().map(code => ({
    code,
    iso: code === 'uk' ? 'gb' : code,
    m3u: IPTV_ORG_COUNTRIES.includes(code) ? `${IPTV_ORG}${code}.m3u` : '',
    epg: (EPG_BY_COUNTRY[code] || []).map(f => EPGSHARE + f)
}));

/** Guide EPG tematiche (non legate a un paese). */
export const THEMATIC_EPG: ThematicEpg[] = [
    { id: 'aljazeera1', name: 'Al Jazeera', url: EPGSHARE + 'epg_ripper_ALJAZEERA1.xml.gz' },
    { id: 'asiantelevision1', name: 'Asian Television', url: EPGSHARE + 'epg_ripper_ASIANTELEVISION1.xml.gz' },
    { id: 'bein1', name: 'beIN Sports', url: EPGSHARE + 'epg_ripper_BEIN1.xml.gz' },
    { id: 'deluxemusic1', name: 'Deluxe Music', url: EPGSHARE + 'epg_ripper_DELUXEMUSIC1.xml.gz' },
    { id: 'directvsports1', name: 'DirecTV Sports', url: EPGSHARE + 'epg_ripper_DIRECTVSPORTS1.xml.gz' },
    { id: 'distrotv1', name: 'DistroTV', url: EPGSHARE + 'epg_ripper_DISTROTV1.xml.gz' },
    { id: 'draftkings1', name: 'DraftKings Network', url: EPGSHARE + 'epg_ripper_DRAFTKINGS1.xml.gz' },
    { id: 'fanduel1', name: 'FanDuel TV', url: EPGSHARE + 'epg_ripper_FANDUEL1.xml.gz' },
    { id: 'pac-12', name: 'Pac-12 Network', url: EPGSHARE + 'epg_ripper_PAC-12.xml.gz' },
    { id: 'plex1', name: 'Plex', url: EPGSHARE + 'epg_ripper_PLEX1.xml.gz' },
    { id: 'powernation1', name: 'PowerNation', url: EPGSHARE + 'epg_ripper_POWERNATION1.xml.gz' },
    { id: 'rakuten1', name: 'Rakuten TV', url: EPGSHARE + 'epg_ripper_RAKUTEN1.xml.gz' },
    { id: 'rakuten_de1', name: 'Rakuten TV (DE)', url: EPGSHARE + 'epg_ripper_RAKUTEN_DE1.xml.gz' },
    { id: 'rakuten_en1', name: 'Rakuten TV (EN)', url: EPGSHARE + 'epg_ripper_RAKUTEN_EN1.xml.gz' },
    { id: 'rakuten_es1', name: 'Rakuten TV (ES)', url: EPGSHARE + 'epg_ripper_RAKUTEN_ES1.xml.gz' },
    { id: 'rakuten_fr1', name: 'Rakuten TV (FR)', url: EPGSHARE + 'epg_ripper_RAKUTEN_FR1.xml.gz' },
    { id: 'rakuten_it1', name: 'Rakuten TV (IT)', url: EPGSHARE + 'epg_ripper_RAKUTEN_IT1.xml.gz' },
    { id: 'rakuten_nl1', name: 'Rakuten TV (NL)', url: EPGSHARE + 'epg_ripper_RAKUTEN_NL1.xml.gz' },
    { id: 'rakuten_pl1', name: 'Rakuten TV (PL)', url: EPGSHARE + 'epg_ripper_RAKUTEN_PL1.xml.gz' },
    { id: 'rally_tv1', name: 'Rally TV', url: EPGSHARE + 'epg_ripper_RALLY_TV1.xml.gz' },
    { id: 'sportklub1', name: 'Sport Klub', url: EPGSHARE + 'epg_ripper_SPORTKLUB1.xml.gz' },
    { id: 'ssportplus1', name: 'S Sport Plus', url: EPGSHARE + 'epg_ripper_SSPORTPLUS1.xml.gz' },
    { id: 'tbnplus1', name: 'TBN+', url: EPGSHARE + 'epg_ripper_TBNPLUS1.xml.gz' },
    { id: 'thesportplus1', name: 'The Sport Plus', url: EPGSHARE + 'epg_ripper_THESPORTPLUS1.xml.gz' },
    { id: 'us_locals2', name: 'USA (local channels)', url: EPGSHARE + 'epg_ripper_US_LOCALS2.xml.gz' },
    { id: 'voa1', name: 'Voice of America', url: EPGSHARE + 'epg_ripper_VOA1.xml.gz' },
    { id: 'viva-russia.ru', name: 'Viva Russia', url: EPGSHARE + 'epg_ripper_viva-russia.ru.xml.gz' },
    { id: 'locomotiontv', name: 'Locomotion TV', url: EPGSHARE + 'locomotiontv.xml.gz' },
];

export function countryPreset(code: string): CountryPreset | undefined {
    return COUNTRY_PRESETS.find(c => c.code === code);
}
