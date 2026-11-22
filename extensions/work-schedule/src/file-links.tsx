import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { ExtensionVaultFile, ExtensionVaultInfo, VaultApi } from 'folyn-extension-sdk';
import { linkName, matchFiles, sameFile, type FileLink, type LinkKind } from './model';
import type { Messages } from './i18n';
import { FileCheck, FileText, X } from './icons';

export const LINK_ICONS: Record<LinkKind, () => ReactNode> = { output: FileCheck, reference: FileText };

/** A linked file. Files of another vault stay visible but cannot be opened from here. */
export function LinkChip({ t, link, currentVaultId, onOpen, onRemove }: {
    t: Messages;
    link: FileLink;
    currentVaultId?: string;
    onOpen?(): void;
    onRemove?(): void;
}) {
    const Icon = LINK_ICONS[link.kind];
    const name = linkName(link.path);
    const other = link.vaultId !== currentVaultId;
    const label = <><Icon/><span className="name">{name}</span>{other && <span className="vault">· {link.vaultName}</span>}</>;
    const title = other ? t.otherVault(link.vaultName) : link.path;
    return <span className={`fws-link ${other ? 'other' : ''}`} title={title}>
        {onOpen
            ? <button type="button" className="open" disabled={other} onClick={onOpen}>{label}</button>
            : <span className="open">{label}</span>}
        {onRemove && <button type="button" className="remove" aria-label={t.removeFile(name)} onClick={onRemove}><X/></button>}
    </span>;
}

type Status = 'idle' | 'loading' | 'ready' | 'noVault' | 'failed';

/** Links of one kind, with a search box over the active vault's files. */
export function LinkField({ t, kind, label, links, vault, onChange }: {
    t: Messages;
    kind: LinkKind;
    label: string;
    links: FileLink[];
    vault: VaultApi;
    onChange(links: FileLink[]): void;
}) {
    const [status, setStatus] = useState<Status>('idle');
    const [files, setFiles] = useState<ExtensionVaultFile[]>([]);
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const source = useRef<ExtensionVaultInfo | null>(null);
    const id = useId();

    const load = async () => {
        setOpen(true);
        const current = vault.current();
        source.current = current;
        if (!current) return setStatus('noVault');
        setStatus('loading');
        try {
            const list = await vault.listFiles();
            // A list from a vault that was switched away from must not be stamped with the old id.
            if (vault.current()?.id !== current.id) return setStatus('idle');
            setFiles(list);
            setStatus('ready');
        }
        catch {
            setStatus('failed');
        }
    };

    const mine = links.filter(l => l.kind === kind);
    const vaultId = source.current?.id;
    const candidates = files.filter(f => !mine.some(l => l.vaultId === vaultId && l.path === f.path));
    const matches = status === 'ready' ? matchFiles(candidates, query) : [];
    const cursor = Math.min(active, Math.max(matches.length - 1, 0));

    const pick = (file: ExtensionVaultFile) => {
        const { id: fileVault, name: vaultName } = source.current!;
        const link: FileLink = { kind, vaultId: fileVault, vaultName, path: file.path };
        // A file has one role: linking it here moves it out of the other kind.
        onChange([...links.filter(l => !sameFile(l, link)), link]);
        setQuery('');
        setActive(0);
        setOpen(false);
    };

    const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') {
            e.preventDefault();
            if (open && matches[cursor]) pick(matches[cursor]);
        }
        else if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
        }
        else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && matches.length) {
            e.preventDefault();
            setOpen(true);
            setActive((cursor + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
        }
    };

    const hint = status === 'noVault' ? t.noVault
        : status === 'failed' ? t.filesFailed
            : status === 'loading' ? t.filesLoading
                : status === 'ready' && !matches.length ? t.noFiles : '';

    return <div className="fws-field wide">
        <label htmlFor={id}>{label}</label>
        <div className="fws-links-input">
            {mine.map(link => <LinkChip key={`${link.vaultId}:${link.path}`} t={t} link={link} currentVaultId={source.current?.id ?? vault.current()?.id}
                onRemove={() => onChange(links.filter(l => !sameFile(l, link)))}/>)}
            <input id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" autoComplete="off"
                placeholder={t.searchFiles} value={query} onFocus={() => void load()} onBlur={() => setOpen(false)}
                onChange={e => { setQuery(e.target.value); setActive(0); setOpen(true); }} onKeyDown={onKey}/>
            {open && <div className="fws-menu" id={`${id}-list`} role="listbox" aria-label={label}>
                {hint && <div className="hint">{hint}</div>}
                {matches.map((file, i) => <button key={file.path} type="button" role="option" aria-selected={i === cursor} tabIndex={-1}
                    className={i === cursor ? 'active' : ''} onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => pick(file)}>
                    <span className="name">{file.name}</span>
                    <span className="path">{file.path}</span>
                </button>)}
            </div>}
        </div>
    </div>;
}
