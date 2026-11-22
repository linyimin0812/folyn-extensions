import type { ExtensionModule } from 'folyn-extension-sdk';
import { Schedule } from './schedule';
import { WorkSchedulePage, setRuntime } from './page';
import { messagesFor } from './i18n';

const extension: ExtensionModule = {
    pages: { 'work-schedule': WorkSchedulePage },
    async activate(api, ctx) {
        if (typeof api.vault.listFiles !== 'function') return setRuntime(undefined, messagesFor(api.env.locale).hostOutdated);
        const schedule = new Schedule(api.storage);
        setRuntime({ schedule, env: api.env, vault: api.vault, files: api.files });
        ctx.addDisposable({ dispose: () => setRuntime(undefined) });
        await schedule.load();
    },
    deactivate() {
        setRuntime(undefined);
    },
};

export default extension;
