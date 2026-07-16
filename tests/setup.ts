(globalThis as any).window = {
    localStorage: {
        getItem: () => 'en',
    },
};
