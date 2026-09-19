import type { ExtensionApi, ExtensionModule } from 'folyn-extension-sdk';
import { ChatAssistantPanel, setApi, setDialogs } from './panel';

const module: ExtensionModule = {
  pages: {
    'assistant-page': ChatAssistantPanel,
  },
  activate: async (api: ExtensionApi, ctx) => {
    setApi(api);
    setDialogs(ctx?.ui?.dialogs);
  },
};

export default module;
