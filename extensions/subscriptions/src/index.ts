import type { ExtensionModule } from 'folyn-extension-sdk';
import { requireSupport } from './host';
import { Subscriptions } from './service';
import { setRuntime, SubscriptionsPage } from './workspace';
let service: Subscriptions | undefined;
const extension: ExtensionModule = {
    pages: { subscriptions: SubscriptionsPage },
    async activate(api, ctx) {
        try {
            const current = new Subscriptions(requireSupport(api, ctx));
            service = current;
            setRuntime(current);
            ctx.addDisposable({ dispose: async () => {
                    const draining = current.stop();
                    if (service === current) setRuntime(undefined);
                    await draining;
                } });
            await current.start();
        }
        catch (error) {
            setRuntime(undefined, error instanceof Error ? error.message : String(error));
        }
    },
    async deactivate() {
        const draining = service?.stop();
        setRuntime(undefined);
        service = undefined;
        await draining;
    },
};
export default extension;
