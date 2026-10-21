import type { SelectOption } from './select';

// Mirrors Folyn i18n SUPPORTED_LOCALES: zh, en, ja, es, de, fr.
// Keep zh-CN as the Chinese translation code to retain existing caches.
export const translationLanguages: SelectOption[] = [
    { value: 'zh-CN', label: '中文' },
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' },
    { value: 'es', label: 'Español' },
    { value: 'de', label: 'Deutsch' },
    { value: 'fr', label: 'Français' },
];
export function selectedLanguage(value: string) {
    const normalized = value.trim().toLowerCase().replace('_', '-');
    if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh-CN';
    return translationLanguages.find(option => option.value === normalized.split('-')[0])?.value || value;
}
export function languageName(value: string) {
    return translationLanguages.find(option => option.value === selectedLanguage(value))?.label || value;
}
