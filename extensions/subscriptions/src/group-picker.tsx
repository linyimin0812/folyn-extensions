import { useId, useRef, useState } from 'react';
import { normalizeGroups } from './groups';

export function GroupPicker({ options, value, onChange }: {
    options: string[];
    value: string[];
    onChange(groups: string[]): void;
}) {
    const [draft, setDraft] = useState(''), [creating, setCreating] = useState(false);
    const id = useId();
    const createButton = useRef<HTMLButtonElement>(null);
    const all = normalizeGroups([...options, ...value]);
    const add = () => {
        const name = draft.trim();
        if (!name) return;
        onChange(normalizeGroups([...value, name]));
        setDraft('');
        setCreating(false);
        createButton.current?.focus();
    };
    return <fieldset className="group-picker" aria-describedby={`${id}-hint`}>
        <legend>分组（可多选）</legend>
        <div className="group-options">{all.map(name => <button type="button" key={name} aria-pressed={value.includes(name)} className={`group-option ${value.includes(name) ? 'selected' : ''}`} onClick={() => onChange(value.includes(name) ? value.filter(group => group !== name) : [...value, name])}>
            <span>{name}</span>
        </button>)}<button ref={createButton} type="button" className="group-new" aria-expanded={creating} aria-controls={`${id}-create`} onClick={() => setCreating(!creating)}>＋ 新建分组</button></div>
        {creating && <div className="row group-create" id={`${id}-create`}>
            <label className="sr-only" htmlFor={`${id}-new`}>新分组名称</label>
            <input autoFocus className="grow" id={`${id}-new`} value={draft} placeholder="输入分组名称…" onChange={event => setDraft(event.target.value)} onKeyDown={event => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); add(); }
                if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setCreating(false); createButton.current?.focus(); }
            }}/>
            <button type="button" disabled={!draft.trim()} onClick={add}>添加分组</button>
        </div>}
        <small id={`${id}-hint`}>可选择多个分组；不选则归入「未分组」。</small>
    </fieldset>;
}
