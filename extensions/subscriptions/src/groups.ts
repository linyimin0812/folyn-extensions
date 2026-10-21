import type { Article, Source, State } from './model';

export function normalizeGroups(names: string[]): string[] {
    return [...new Set(names.map(name => name.trim()).filter(Boolean))];
}
export function assignGroups(state: State, source: Source, names: string[]) {
    source.groups = normalizeGroups(names);
    state.groups = normalizeGroups([...state.groups, ...source.groups]);
}
export function isInGroup(article: Article, sources: Source[], name: string): boolean {
    return article.sourceIds.some(id => sources.some(source => source.id === id && source.groups.includes(name)));
}
export function renameGroup(state: State, from: string, input: string) {
    const to = input.trim();
    if (!to || (to !== from && state.groups.includes(to))) throw new Error('请输入不重复的分组名称');
    state.groups = normalizeGroups(state.groups.map(name => name === from ? to : name));
    state.sources.forEach(source => { source.groups = normalizeGroups(source.groups.map(name => name === from ? to : name)); });
    state.collapsed = normalizeGroups(state.collapsed.map(name => name === from ? to : name));
    if (state.ui.view === `group:${from}`) state.ui.view = `group:${to}`;
}
export function removeGroup(state: State, name: string) {
    state.groups = state.groups.filter(group => group !== name);
    state.sources.forEach(source => { source.groups = source.groups.filter(group => group !== name); });
    state.collapsed = state.collapsed.filter(group => group !== name);
    if (state.ui.view === `group:${name}`) state.ui.view = 'all';
}
