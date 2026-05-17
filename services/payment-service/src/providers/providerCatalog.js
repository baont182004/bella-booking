export const declaredPaymentProviders = ["mock", "stripe"];
export const implementedPaymentProviders = ["mock", "stripe"];

export function listDeclaredPaymentProviders() {
  return [...declaredPaymentProviders];
}

export function listImplementedPaymentProviders() {
  return [...implementedPaymentProviders];
}

export function isDeclaredPaymentProvider(name = "") {
  return declaredPaymentProviders.includes(name);
}

export function isImplementedPaymentProvider(name = "") {
  return implementedPaymentProviders.includes(name);
}
