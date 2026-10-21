/** One pool per extension instance, so multiple articles share the same limit. */
export class TranslationRequests {
    private running = 0;
    private waiting: (() => void)[] = [];
    async run<T>(request: () => Promise<T>): Promise<T> {
        if (this.running >= 2) await new Promise<void>(resolve => this.waiting.push(resolve));
        else this.running++;
        try {
            return await request();
        } finally {
            const next = this.waiting.shift();
            if (next) next();
            else this.running--;
        }
    }
}
