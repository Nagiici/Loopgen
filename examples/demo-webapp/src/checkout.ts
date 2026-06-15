export interface CartItem {
  sku: string;
  price: number;
  quantity: number;
}

export function calculateSubtotal(items: CartItem[]) {
  return items.reduce((total, item) => total + item.price * item.quantity, 0);
}
