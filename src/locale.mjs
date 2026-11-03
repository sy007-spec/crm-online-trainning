import geoip from 'geoip-country';
import {normalizeIp} from './security.mjs';
const chineseRegions=new Set(['CN','HK','MO','TW']);
export function languageForIp(ip,lookup=geoip.lookup){let country='';try{country=lookup(normalizeIp(ip))?.country||''}catch{}return {country,language:chineseRegions.has(country)?'zh':'en'}}
