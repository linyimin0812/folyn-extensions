import { useEffect, useState } from 'react';
import type { ExtensionAiPair } from 'folyn-extension-sdk';
import type { Subscriptions } from './service';
import { message } from './model';
import { SelectField } from './select';

type Pair = Pick<ExtensionAiPair, 'provider' | 'model'>;
export function sameModel(a?: Pair, b?: Pair) {
    return !!a && !!b && a.provider === b.provider && a.model === b.model;
}
export function modelKey(pair?: Pair) {
    return pair ? JSON.stringify([pair.provider, pair.model]) : '';
}
/** Use the public capability, never the host's private stores or credentials. */
export function useTranslationModels(service: Subscriptions) {
    const [pairs, setPairs] = useState<ExtensionAiPair[]>([]);
    const [loading, setLoading] = useState(true), [error, setError] = useState('');
    useEffect(() => {
        let stopped = false, request = 0;
        const load = async () => {
            const current = ++request;
            setLoading(true);
            try {
                const values = await service.host.api.ai.pairs();
                if (!stopped && current === request) {
                    setPairs(values.filter((pair, index) => values.findIndex(other => sameModel(pair, other)) === index));
                    setError('');
                }
            } catch (e) {
                if (!stopped && current === request) { setPairs([]); setError(message(e)); }
            } finally {
                if (!stopped && current === request) setLoading(false);
            }
        };
        void load();
        window.addEventListener('focus', load);
        return () => { stopped = true; window.removeEventListener('focus', load); };
    }, [service]);
    return { pairs, loading, error };
}

export function TranslationModelField({ pairs, value, onChange, loading, error }: {
    pairs: ExtensionAiPair[]; value?: Pair; onChange(pair: ExtensionAiPair): void; loading: boolean; error: string;
}) {
    const available = pairs.some(pair => sameModel(pair, value));
    const options = pairs.map(pair => ({ value: modelKey(pair), label: `${pair.label || pair.provider} / ${pair.model}` }));
    if (!available) options.unshift({ value: modelKey(value), label: loading ? '正在读取模型…' : value ? `${value.provider} / ${value.model}（不可用）` : '暂无可用模型' });
    return <div className="stack">
        <SelectField label="翻译模型" value={modelKey(value)} options={options} disabled={loading || !pairs.length} onChange={key => {
            const selected = pairs.find(pair => modelKey(pair) === key);
            if (selected) onChange(selected);
        }}/>
        {error ? <small className="error" role="status">模型列表读取失败：{error}</small> : !loading && value && !available ? <small className="error" role="status">此模型已停用或移除，请选择当前可用的模型。</small> : !loading && !pairs.length ? <small>在 Folyn 的 AI 模型配置中启用模型后即可选择。</small> : null}
    </div>;
}
