import mockProvider from "./mockProvider.js";
import payosProvider from "./payosProvider.js";
import stripeProvider from "./stripeProvider.js";
import {
  isDeclaredPaymentProvider,
  isImplementedPaymentProvider,
  listDeclaredPaymentProviders,
  listImplementedPaymentProviders,
} from "./providerCatalog.js";
const providers = new Map([
  [mockProvider.name, mockProvider],
  [stripeProvider.name, stripeProvider],
  [payosProvider.name, payosProvider],
]);

export function getPaymentProvider(name = process.env.PAYMENT_PROVIDER || mockProvider.name) {
  const provider = providers.get(name);
  if (!provider) {
    const error = new Error(
      isDeclaredPaymentProvider(name)
        ? `Payment provider "${name}" is declared but not implemented yet`
        : `Unsupported payment provider "${name}"`,
    );
    error.status = 400;
    throw error;
  }

  return provider;
}

export {
  isDeclaredPaymentProvider,
  isImplementedPaymentProvider,
  listDeclaredPaymentProviders,
  listImplementedPaymentProviders,
};
