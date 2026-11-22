import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { EnvApi, ExtensionStorageApi, FileApi, VaultApi } from 'folyn-extension-sdk';
import { Schedule } from '../src/schedule';
import { WorkSchedulePage, setRuntime } from '../src/page';
import extension from '../src/index';
import { addDays, dateKey } from '../src/model';

const env: EnvApi = {
    theme: 'light',
    locale: 'zh',
    onThemeChange: () => ({ dispose() {} }),
    onLocaleChange: () => ({ dispose() {} }),
};

const vaultFiles = [{ path: 'docs/plan.md', name: 'plan.md' }, { path: 'docs/notes.md', name: 'notes.md' }];

async function mount(items: unknown[] = [], current: { id: string; name: string } | null = { id: 'v1', name: 'Work' }) {
    const data = new Map<string, unknown>([['items', items]]);
    const storage: ExtensionStorageApi = { async get(k) { return data.get(k); }, async set(k, v) { data.set(k, v); } };
    const schedule = new Schedule(storage);
    await schedule.load();
    const vault = { current: () => current, listFiles: async () => vaultFiles } as unknown as VaultApi;
    const files = { open: vi.fn(async () => {}) } satisfies FileApi;
    act(() => setRuntime({ schedule, env, vault, files }));
    render(<WorkSchedulePage/>);
    return { schedule, data, files };
}

function openEditor(title: string) {
    const row = screen.getByText(title).closest('.fws-item')!;
    fireEvent.click(row.querySelector('[aria-label="编辑"]')!);
}

afterEach(() => {
    cleanup();
    setRuntime(undefined);
});

describe('WorkSchedulePage', () => {
    it('explains an outdated host instead of starting without vault access', async () => {
        await act(async () => { await extension.activate?.({ vault: {}, env: { locale: 'zh' } } as never, {} as never); });
        render(<WorkSchedulePage/>);
        expect(screen.getByText(/当前 Folyn 版本过低/)).toBeTruthy();
    });

    it('opens on today with the quick-add input focused', async () => {
        await mount();
        expect(document.activeElement).toBe(screen.getByPlaceholderText('添加工作事项，回车保存'));
        expect(screen.getByText('这一天还没有工作事项')).toBeTruthy();
    });

    it('quick-adds an item to the shown day', async () => {
        const { data } = await mount();
        const input = screen.getByPlaceholderText('添加工作事项，回车保存');
        fireEvent.change(input, { target: { value: '周会' } });
        await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
        expect(screen.getByText('周会')).toBeTruthy();
        expect(data.get('items')).toEqual([expect.objectContaining({ title: '周会', date: dateKey(new Date()), priority: 'medium' })]);
    });

    it('rejects a time range that ends before it starts', async () => {
        await mount();
        fireEvent.click(screen.getByText('更多选项'));
        fireEvent.change(screen.getByLabelText('标题'), { target: { value: '上线' } });
        const [start, end] = document.querySelectorAll<HTMLInputElement>('input[type=time]');
        fireEvent.change(start, { target: { value: '15:00' } });
        fireEvent.change(end, { target: { value: '14:00' } });
        fireEvent.click(screen.getByText('保存'));
        expect(screen.getByRole('alert').textContent).toBe('结束时间必须晚于开始时间');
    });

    it('moves an item to another day by picking a date in the editor', async () => {
        const today = dateKey(new Date());
        const tomorrow = addDays(today, 1);
        await mount([{ id: 'a', date: today, title: '写周报', done: false, priority: 'high', tags: [], note: '', createdAt: 1 }]);
        openEditor('写周报');
        fireEvent.click(document.querySelector('.fws-editor [aria-haspopup]')!);
        fireEvent.click(document.querySelector(`.fws-editor [data-date="${tomorrow}"]`)!);
        await act(async () => { fireEvent.click(screen.getByText('保存')); });
        expect(screen.queryByText('写周报')).toBeNull();
        fireEvent.click(screen.getByLabelText('后一天'));
        expect(screen.getByText('写周报')).toBeTruthy();
    });

    it('jumps to a day from the header calendar and marks days with items', async () => {
        const today = dateKey(new Date());
        const target = addDays(today, 3);
        await mount([{ id: 'a', date: target, title: '发版', done: false, priority: 'medium', tags: [], note: '', createdAt: 1 }]);
        fireEvent.click(screen.getByLabelText('选择日期'));
        expect(document.querySelector(`.fws-cal [data-date="${today}"]`)!.className).toContain('today');
        // The grid shows six weeks from the current month; a target in the next month may need a page.
        if (target.slice(0, 7) !== today.slice(0, 7)) fireEvent.click(screen.getByLabelText('下个月'));
        const cell = document.querySelector<HTMLElement>(`.fws-cal [data-date="${target}"]`)!;
        expect(cell.className).toContain('mark');
        fireEvent.click(cell);
        expect(document.querySelector('.fws-cal')).toBeNull();
        expect(screen.getByText('发版')).toBeTruthy();
    });

    it('closes the calendar on Escape without leaving the editor', async () => {
        await mount([{ id: 'a', date: dateKey(new Date()), title: '写周报', done: false, priority: 'high', tags: [], note: '', createdAt: 1 }]);
        openEditor('写周报');
        fireEvent.click(document.querySelector('.fws-editor [aria-haspopup]')!);
        fireEvent.keyDown(document.querySelector('.fws-cal')!, { key: 'Escape' });
        expect(document.querySelector('.fws-cal')).toBeNull();
        expect(document.querySelector('.fws-editor')).toBeTruthy();
    });

    describe('entering the editor', () => {
        const item = { id: 'a', date: dateKey(new Date()), title: '写周报', done: false, priority: 'high', tags: [], note: '', links: [], createdAt: 1 };

        it('ignores single clicks on the row and its title', async () => {
            await mount([item]);
            fireEvent.click(screen.getByText('写周报'));
            fireEvent.click(document.querySelector('.fws-item')!);
            expect(document.querySelector('.fws-editor')).toBeNull();
        });

        it('stays closed when the checkbox is clicked twice quickly', async () => {
            await mount([item]);
            const check = screen.getByRole('checkbox');
            await act(async () => { fireEvent.click(check); });
            await act(async () => { fireEvent.click(check); });
            fireEvent.doubleClick(check);
            expect(document.querySelector('.fws-editor')).toBeNull();
        });

        it('puts the row actions after the time column', async () => {
            await mount([item]);
            const row = document.querySelector('.fws-row')!;
            expect(row.lastElementChild!.className).toBe('fws-rowacts');
            expect(row.lastElementChild!.querySelector('[aria-label="编辑"]')).toBeTruthy();
        });

        it('opens from the edit button and from a double click on the title', async () => {
            await mount([item]);
            fireEvent.doubleClick(screen.getByText('写周报'));
            expect(document.querySelector('.fws-editor')).toBeTruthy();
            fireEvent.click(screen.getByText('取消'));
            openEditor('写周报');
            expect(document.querySelector('.fws-editor')).toBeTruthy();
        });
    });

    describe('week and month views', () => {
        const today = dateKey(new Date());
        const base = { done: false, priority: 'medium', tags: [], note: '', links: [] };
        const items = [
            { ...base, id: 'a', date: today, title: '今天的事', estimate: 2, createdAt: 1 },
            { ...base, id: 'b', date: today, title: '做完的事', done: true, estimate: 1, createdAt: 2 },
            { ...base, id: 'c', parentId: 'a', date: today, title: '子事项', estimate: 5, createdAt: 3 },
        ];

        it('shows the week grouped by day with totals, and ticks items in place', async () => {
            const { data } = await mount(items);
            fireEvent.click(screen.getByText('周'));
            expect(document.querySelectorAll('.fws-week-day')).toHaveLength(7);
            expect(document.querySelector('.fws-week-day.today')!.textContent).toContain('今天的事');
            expect(screen.queryByText('子事项')).toBeNull();
            expect(screen.getByText('0/1')).toBeTruthy();
            expect(document.querySelector('.fws-heading p')!.textContent).toContain('预估 3 小时');
            expect(screen.queryByPlaceholderText('添加工作事项，回车保存')).toBeNull();
            await act(async () => { fireEvent.click(screen.getAllByLabelText('标记为已完成')[0]); });
            expect((data.get('items') as { id: string; done: boolean }[]).find(i => i.id === 'a')!.done).toBe(true);
        });

        it('opens a day from the week view', async () => {
            await mount(items);
            fireEvent.click(screen.getByText('周'));
            fireEvent.click(screen.getByText('今天的事'));
            expect(screen.getByText('日').getAttribute('aria-pressed')).toBe('true');
            expect(screen.getByPlaceholderText('添加工作事项，回车保存')).toBeTruthy();
        });

        it('pages by week and month, and returns to the current period', async () => {
            await mount(items);
            fireEvent.click(screen.getByText('周'));
            fireEvent.click(screen.getByLabelText('下一周'));
            expect(document.querySelector('.fws-week-day.today')).toBeNull();
            fireEvent.click(screen.getByText('本周'));
            expect(document.querySelector('.fws-week-day.today')).toBeTruthy();
            fireEvent.click(screen.getByText('月'));
            const title = () => document.querySelector('.fws-heading p')!.textContent;
            const thisMonth = title();
            // The six-week grid also shows days of the neighbouring months, so
            // compare the period in the title, not the highlighted cell.
            fireEvent.click(screen.getByLabelText('上个月'));
            expect(title()).not.toBe(thisMonth);
            expect((screen.getByText('本月') as HTMLButtonElement).disabled).toBe(false);
            fireEvent.click(screen.getByText('本月'));
            expect(title()).toBe(thisMonth);
            expect((screen.getByText('本月') as HTMLButtonElement).disabled).toBe(true);
        });

        it('shows up to three titles a day in the month and opens the day', async () => {
            const many = Array.from({ length: 5 }, (_, i) => ({ ...base, id: `m${i}`, date: today, title: `事项${i}`, createdAt: i }));
            await mount(many);
            fireEvent.click(screen.getByText('月'));
            const cell = document.querySelector('.fws-month-day.today')!;
            expect(cell.querySelectorAll('.fws-month-item')).toHaveLength(3);
            expect(cell.textContent).toContain('+2');
            fireEvent.click(cell);
            expect(screen.getByText('日').getAttribute('aria-pressed')).toBe('true');
            expect(screen.getByText('事项4')).toBeTruthy();
        });

        it('offers carry-over only in the day view', async () => {
            await mount([{ ...base, id: 'old', date: addDays(today, -1), title: '旧事项', createdAt: 1 }]);
            expect(screen.getByText('同步未完成（1）')).toBeTruthy();
            fireEvent.click(screen.getByText('周'));
            expect(screen.queryByText(/同步未完成/)).toBeNull();
        });
    });

    describe('bringing unfinished items forward', () => {
        const today = dateKey(new Date());
        const yesterday = addDays(today, -1);
        const base = { done: false, priority: 'medium', tags: [], note: '', links: [] };
        const items = [
            { ...base, id: 'old', date: yesterday, title: '没写完的周报', time: { start: '09:00', end: '10:00' }, createdAt: 1 },
            { ...base, id: 'forgot', date: yesterday, title: '其实做完了', createdAt: 2 },
            { ...base, id: 'fin', date: yesterday, title: '已完成', done: true, createdAt: 3 },
        ];
        const dateOf = (data: Map<string, unknown>, id: string) => (data.get('items') as { id: string; date: string }[]).find(i => i.id === id)!.date;

        it('changes nothing until the selection is confirmed', async () => {
            const { data } = await mount(items);
            fireEvent.click(screen.getByText('同步未完成（2）'));
            expect(screen.getByRole('dialog', { name: '选择要同步到今天的事项' })).toBeTruthy();
            expect(dateOf(data, 'old')).toBe(yesterday);
            fireEvent.click(screen.getByText('取消'));
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(dateOf(data, 'old')).toBe(yesterday);
        });

        it('brings only the checked items and reports the count', async () => {
            const { data } = await mount(items);
            fireEvent.click(screen.getByText('同步未完成（2）'));
            fireEvent.click(screen.getByLabelText('其实做完了'));
            await act(async () => { fireEvent.click(screen.getByText('同步所选（1）')); });
            expect(dateOf(data, 'old')).toBe(today);
            expect(dateOf(data, 'forgot')).toBe(yesterday);
            expect(screen.getByRole('status').textContent).toBe('已将 1 项未完成事项同步到今天');
            expect(screen.getByText('同步未完成（1）')).toBeTruthy();
        });

        it('marks an item done from the list instead of bringing it', async () => {
            const { data } = await mount(items);
            fireEvent.click(screen.getByText('同步未完成（2）'));
            const row = screen.getByLabelText('其实做完了').closest('label')!;
            await act(async () => { fireEvent.click(row.querySelector('button')!); });
            expect((data.get('items') as { id: string; done: boolean }[]).find(i => i.id === 'forgot')!.done).toBe(true);
            expect(screen.queryByLabelText('其实做完了')).toBeNull();
            expect(screen.getByText('同步所选（1）')).toBeTruthy();
        });

        it('disables confirming an empty selection', async () => {
            await mount(items);
            fireEvent.click(screen.getByText('同步未完成（2）'));
            fireEvent.click(screen.getByText('全不选'));
            expect((screen.getByText('同步所选（0）') as HTMLButtonElement).disabled).toBe(true);
        });

        it('copies a partly done parent to today and leaves the done part on its day', async () => {
            const { data } = await mount([
                { ...base, id: 'p', date: yesterday, title: '发版', priority: 'high', createdAt: 1 },
                { ...base, id: 'd', parentId: 'p', date: yesterday, title: '打包', done: true, createdAt: 2 },
                { ...base, id: 'o', parentId: 'p', date: yesterday, title: '写说明', createdAt: 3 },
            ]);
            fireEvent.click(screen.getByText('同步未完成（1）'));
            expect(screen.getByText('子事项 1/2 未完成')).toBeTruthy();
            await act(async () => { fireEvent.click(screen.getByText('同步所选（1）')); });
            expect(screen.getByText('发版')).toBeTruthy();
            expect(screen.getByText('写说明')).toBeTruthy();
            expect(screen.queryByText('打包')).toBeNull();
            fireEvent.click(screen.getByLabelText('前一天'));
            expect(screen.getByText('发版')).toBeTruthy();
            expect(screen.getByText('打包')).toBeTruthy();
            expect(screen.queryByText('写说明')).toBeNull();
            expect((data.get('items') as unknown[])).toHaveLength(4);
        });

        it('is not offered on other days', async () => {
            await mount(items);
            fireEvent.click(screen.getByLabelText('前一天'));
            expect(screen.queryByText(/同步未完成/)).toBeNull();
        });
    });

    describe('subitems', () => {
        const today = dateKey(new Date());
        const base = { date: today, done: false, priority: 'medium', tags: [], note: '', links: [] };
        const parent = { ...base, id: 'p', title: '发版', createdAt: 1 };
        const child = { ...base, id: 'c', parentId: 'p', title: '写变更说明', createdAt: 2 };

        it('adds several subitems in a row and shows progress on the parent', async () => {
            const { data } = await mount([parent]);
            fireEvent.click(screen.getByLabelText('添加子事项'));
            const input = screen.getByPlaceholderText('添加子事项，回车保存，Esc 结束');
            for (const title of ['打包', '验证']) {
                fireEvent.change(input, { target: { value: title } });
                await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
            }
            expect((data.get('items') as { parentId?: string }[]).filter(i => i.parentId === 'p')).toHaveLength(2);
            expect(screen.getByText('0/2')).toBeTruthy();
            fireEvent.keyDown(input, { key: 'Escape' });
            expect(screen.queryByPlaceholderText('添加子事项，回车保存，Esc 结束')).toBeNull();
        });

        it('collapses subitems and counts only parents in the page progress', async () => {
            await mount([parent, child]);
            expect(screen.getByText(/已完成 0\/1/)).toBeTruthy();
            fireEvent.click(screen.getByLabelText('折叠子事项'));
            expect(screen.queryByText('写变更说明')).toBeNull();
            fireEvent.click(screen.getByLabelText('展开子事项'));
            expect(screen.getByText('写变更说明')).toBeTruthy();
        });

        it('edits every field of a subitem except its date, and offers no deeper nesting', async () => {
            await mount([parent, child]);
            expect(screen.getAllByLabelText('添加子事项')).toHaveLength(1);
            openEditor('写变更说明');
            expect(screen.getByLabelText('预估工时')).toBeTruthy();
            expect(screen.getByLabelText('产出')).toBeTruthy();
            expect(document.querySelector('.fws-editor [aria-haspopup]')).toBeNull();
        });

        it('deletes from the row on a second click, without opening the editor', async () => {
            const { data } = await mount([parent, child]);
            const button = screen.getAllByLabelText('删除')[0];
            fireEvent.click(button);
            expect(data.get('items')).toHaveLength(2);
            expect(document.querySelector('.fws-editor')).toBeNull();
            expect(button.textContent).toBe('确认删除（含 1 个子事项）');
            await act(async () => { fireEvent.click(button); });
            expect(data.get('items')).toEqual([]);
        });

        it('disarms the row delete when the pointer leaves', async () => {
            const { data } = await mount([parent]);
            const button = screen.getByLabelText('删除');
            fireEvent.click(button);
            fireEvent.mouseLeave(button);
            await act(async () => { fireEvent.click(button); });
            expect(data.get('items')).toHaveLength(1);
            expect(button.textContent).toBe('确认删除');
        });

        it('deletes a subitem from its own row and keeps the parent', async () => {
            const { data } = await mount([parent, child]);
            const button = screen.getAllByLabelText('删除')[1];
            fireEvent.click(button);
            await act(async () => { fireEvent.click(button); });
            expect(data.get('items')).toEqual([expect.objectContaining({ id: 'p' })]);
        });

        it('warns that deleting a parent takes its subitems', async () => {
            await mount([parent, child]);
            openEditor('发版');
            fireEvent.click(document.querySelector('.fws-editor .btn-d')!);
            expect(document.querySelector('.fws-editor .btn-d')!.textContent).toBe('确认删除（含 1 个子事项）');
        });
    });

    describe('linked files', () => {
        const today = dateKey(new Date());
        const item = (links: unknown[]) => ({ id: 'a', date: today, title: '写周报', done: false, priority: 'high', tags: [], note: '', links, createdAt: 1 });
        const output = { kind: 'output', vaultId: 'v1', vaultName: 'Work', path: 'docs/plan.md' };

        async function search(label: string, query: string) {
            const input = screen.getByLabelText(label);
            await act(async () => { fireEvent.focus(input); });
            fireEvent.change(input, { target: { value: query } });
            return input;
        }

        it('links a searched file as an output and saves it with the vault', async () => {
            const { data } = await mount([item([])]);
            openEditor('写周报');
            await search('产出', 'plan');
            fireEvent.click(screen.getByRole('option'));
            await act(async () => { fireEvent.click(screen.getByText('保存')); });
            expect(data.get('items')).toEqual([expect.objectContaining({ links: [output] })]);
        });

        it('picks with the keyboard without submitting the form or closing the editor', async () => {
            await mount([item([])]);
            openEditor('写周报');
            const input = await search('相关资料', '');
            fireEvent.keyDown(input, { key: 'ArrowDown' });
            fireEvent.keyDown(input, { key: 'Enter' });
            expect(document.querySelector('.fws-editor')).toBeTruthy();
            expect(screen.getByText('notes.md')).toBeTruthy();
            fireEvent.focus(input);
            fireEvent.keyDown(input, { key: 'Escape' });
            expect(document.querySelector('.fws-editor')).toBeTruthy();
        });

        it('moves a file between kinds instead of linking it twice', async () => {
            const { data } = await mount([item([output])]);
            openEditor('写周报');
            await search('相关资料', 'plan');
            fireEvent.click(screen.getByRole('option'));
            await act(async () => { fireEvent.click(screen.getByText('保存')); });
            expect(data.get('items')).toEqual([expect.objectContaining({ links: [{ ...output, kind: 'reference' }] })]);
        });

        it('opens a file of the current vault without entering the editor', async () => {
            const { files } = await mount([item([output])]);
            fireEvent.click(screen.getByText('plan.md'));
            expect(files.open).toHaveBeenCalledWith('docs/plan.md');
            expect(document.querySelector('.fws-editor')).toBeNull();
        });

        it('shows the vault of a file elsewhere and does not open it', async () => {
            const { files } = await mount([item([output])], { id: 'v2', name: 'Home' });
            const chip = screen.getByText('plan.md').closest('button')!;
            expect(chip.disabled).toBe(true);
            expect(chip.textContent).toContain('Work');
            fireEvent.click(chip);
            expect(files.open).not.toHaveBeenCalled();
        });

        it('keeps the link and reports a file that no longer exists', async () => {
            const { files } = await mount([item([output])]);
            files.open.mockRejectedValueOnce(new Error('gone'));
            await act(async () => { fireEvent.click(screen.getByText('plan.md')); });
            expect(screen.getByRole('alert').textContent).toBe('文件已不存在：plan.md');
            expect(screen.getByText('plan.md')).toBeTruthy();
        });

        it('dismisses the notice with its close button', async () => {
            const { files } = await mount([item([output])]);
            files.open.mockRejectedValueOnce(new Error('gone'));
            await act(async () => { fireEvent.click(screen.getByText('plan.md')); });
            fireEvent.click(screen.getByLabelText('关闭'));
            expect(screen.queryByRole('alert')).toBeNull();
            expect(document.querySelector('.fws-editor')).toBeNull();
        });

        it('asks for a vault when none is open', async () => {
            await mount([item([])], null);
            openEditor('写周报');
            await search('产出', '');
            expect(screen.getByText('请先打开一个 Vault')).toBeTruthy();
        });
    });
});
