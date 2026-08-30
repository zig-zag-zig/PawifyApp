import { assertOk, daprFetch } from './daprClient.js';

export const invokeDaprBinding = async (bindingName: string, payload: unknown): Promise<void> => {
    const response = await daprFetch(`/v1.0/bindings/${bindingName}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    await assertOk(response, `invoke Dapr binding ${bindingName}`);
};
