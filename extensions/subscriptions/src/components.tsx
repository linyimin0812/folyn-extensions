import { createContext, useContext, useLayoutEffect, useId, useRef, type ReactNode } from 'react';
import { Subscriptions } from './service';
export function Icon({ name, size = 18 }: {
    name: 'send' | 'book' | 'more' | 'rss' | 'plus' | 'refresh' | 'settings' | 'menu' | 'back' | 'close' | 'star' | 'external' | 'save' | 'inbox' | 'unread' | 'check' | 'search' | 'panel-left' | 'panel-right' | 'fetch' | 'warning' | 'error' | 'folder' | 'translate' | 'trash' | 'info';
    size?: number;
}) {
    const paths = { send: <path d="M12 19V5m-6 6 6-6 6 6"/>, book: <path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1ZM12 5v15"/>, more: <><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/></>, info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.2"/></>, folder: <path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z"/>, translate: <><path d="M3 5h12M9 3v2M5 5c0 6 7 10 7 10M13 5c0 6-7 10-7 10M14 21l4-10 4 10M16 17h4"/></>, trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/></>, rss: <>
        <circle cx="5" cy="19" r="1"/>
        <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/>
        </>, plus: <path d="M12 5v14M5 12h14"/>, refresh: <>
        <path d="M20 7v5h-5M4 17v-5h5"/>
        <path d="M6 6a8 8 0 0 1 13 2M18 18a8 8 0 0 1-13-2"/>
        </>, settings: <>
        <circle cx="12" cy="12" r="3"/>
        <path d="m10 3-.7 2.1-2 .9-2.2-.4L3 9l1.5 1.7v2.6L3 15l2.1 3.4 2.2-.4 2 .9L10 21h4l.7-2.1 2-.9 2.2.4L21 15l-1.5-1.7v-2.6L21 9l-2.1-3.4-2.2.4-2-.9L14 3z"/>
        </>, menu: <path d="M4 6h16M4 12h16M4 18h16"/>, back: <path d="m14 6-6 6 6 6"/>, close: <path d="m6 6 12 12M6 18 18 6"/>, star: <path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2L3 9.6l6.3-.9z"/>, external: <>
        <path d="M14 3h7v7m0-7L10 14"/>
        <path d="M10 4H4v16h16v-6"/>
        </>, save: <>
        <path d="M5 3h12l4 4v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M7 3v6h10V3M7 21v-8h10v8M14 5v2"/>
        </>, inbox: <><path d="m4 4-2 11v5h20v-5L20 4z"/><path d="M2 14h6l2 3h4l2-3h6"/></>, unread: <circle cx="12" cy="12" r="7"/>, check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>, search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>, 'panel-left': <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 5v14"/></>, 'panel-right': <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M15 5v14"/></>, fetch: <><path d="M12 4v10m-4-4 4 4 4-4"/><path d="M5 20h14"/></>, warning: <><path d="M12 4 21 19H3z"/><path d="M12 10v4M12 16.7v.2"/></>, error: <><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></> };
    return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
export const ModalMessagesContext = createContext<ReactNode>(null);
export function Modal({ title, description, icon = 'settings', size = 'default', tone = 'normal', note, onClose, children, footer }: {
    title: string;
    description?: string;
    icon?: React.ComponentProps<typeof Icon>['name'];
    size?: 'default' | 'compact' | 'source';
    tone?: 'normal' | 'danger';
    note?: string;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    const label = useId();
    const messages = useContext(ModalMessagesContext);
    useLayoutEffect(() => {
        const previous = document.activeElement as HTMLElement;
        const el = ref.current!;
        el.showModal();
        (el.querySelector<HTMLElement>('[data-autofocus]') || el.querySelector<HTMLElement>('.modal-body input:not([type=hidden]), .modal-body [role=combobox]'))?.focus();
        return () => {
            el.close();
            previous?.focus();
        };
    }, []);
    return <dialog ref={ref} className={`modal modal-${size} modal-${tone}`} aria-labelledby={label} aria-describedby={description ? `${label}-description` : undefined} onCancel={e => {
        e.preventDefault();
        onClose();
    }}>
    <div className="modal-header">
    <div className="modal-symbol"><Icon name={icon} size={19}/></div>
    <div className="modal-heading"><h2 id={label}>{title}</h2>{description && <p id={`${label}-description`}>{description}</p>}</div>
    <button className="icon-button" aria-label="关闭" onClick={onClose}>
    <Icon name="close" size={16}/>
    </button>
    </div>
    <div className="modal-body">{children}</div>{footer && <div className="modal-footer">{note && <small className="modal-note" title={note}>{note}</small>}<div className="modal-footer-actions">{footer}</div></div>}{messages}</dialog>;
}
export function ModalSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
    const id = useId();
    return <section className="modal-section" aria-labelledby={id}><div className="modal-section-heading"><h3 id={id}>{title}</h3>{aside}</div><div className="stack">{children}</div></section>;
}
export function Spinner() {
    return <span className="inline-spinner" aria-hidden="true"/>;
}
export function Empty({ title, children, action }: {
    title: string;
    children?: ReactNode;
    action?: ReactNode;
}) {
    return <div className="empty">
    <div className="empty-icon">
    <Icon name="rss" size={20}/>
    </div>
    <h2>{title}</h2>{children && <p>{children}</p>}{action}</div>;
}
export function SourceLink({ url, service, children }: {
    url: string;
    service: Subscriptions;
    children: ReactNode;
}) {
    return <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => {
        e.preventDefault();
        void service.host.support.openExternal(url).catch(error => service.notify(String(error), 'error'));
    }}>{children}</a>;
}
