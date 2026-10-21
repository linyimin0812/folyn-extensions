import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { NotificationMessage, Subscriptions } from './service';
import { Icon } from './components';

export function Messages({ service, embedded = false }: { service: Subscriptions; embedded?: boolean }) {
    useSyncExternalStore(service.subscribe, service.snapshot);
    return <div className={`message-stack ${embedded ? 'message-embedded' : 'message-workspace'}`} aria-label="操作通知">
        {service.messages.map(item => <MessageCard key={item.id} service={service} item={item}/>)}
    </div>;
}
function MessageCard({ service, item }: { service: Subscriptions; item: NotificationMessage }) {
    const held = useRef({ pointer: false, focus: false });
    const hold = (kind: 'pointer' | 'focus', value: boolean) => {
        held.current[kind] = value;
        if (held.current.pointer || held.current.focus) service.pauseMessage(item.id);
        else service.resumeMessage(item.id);
    };
    useEffect(() => () => service.resumeMessage(item.id), [service, item.id]);
    return <div className={`message-card ${item.kind}`} role={item.kind === 'error' ? 'alert' : 'status'} onMouseEnter={() => hold('pointer', true)} onMouseLeave={() => hold('pointer', false)} onFocusCapture={() => hold('focus', true)} onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hold('focus', false);
    }}>
            <span className="message-symbol"><Icon name={item.kind === 'success' ? 'check' : item.kind === 'warning' ? 'warning' : item.kind === 'error' ? 'error' : 'info'} size={14}/></span>
            <span className="message-text">{item.text}</span>
            <button type="button" className="icon-button" aria-label="关闭通知" title="关闭通知" onClick={() => service.dismissMessage(item.id)}><Icon name="close" size={12}/></button>
    </div>;
}
