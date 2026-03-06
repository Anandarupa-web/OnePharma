/**
 * PosCart.js – Persistent billing cart for the Staff POS view.
 *
 * Props:
 *   items       – Array of cart line items
 *                 { id, name, price, qty, gst }
 *
 * Emits:
 *   update-qty     – { id, qty }  when qty changes
 *   remove-item    – id           when an item is removed
 *   checkout       – no payload   when Checkout is clicked
 */
import { defineComponent, computed } from 'vue';

export default defineComponent({
  name: 'PosCart',

  props: {
    items: { type: Array, required: true },
  },

  emits: ['update-qty', 'remove-item', 'checkout'],

  setup(props) {
    /** Per-line subtotal BEFORE tax. */
    const lineSubtotal = (item) => +(item.price * item.qty).toFixed(2);

    /** Per-line GST amount. */
    const lineGst = (item) => +((item.price * item.qty * item.gst) / 100).toFixed(2);

    /** Basket subtotal (pre-tax). */
    const subtotal = computed(() =>
      props.items.reduce((s, i) => s + lineSubtotal(i), 0).toFixed(2)
    );

    /** Total GST across all lines. */
    const totalGst = computed(() =>
      props.items.reduce((s, i) => s + lineGst(i), 0).toFixed(2)
    );

    /** Grand total including GST. */
    const grandTotal = computed(() =>
      (+subtotal.value + +totalGst.value).toFixed(2)
    );

    return { lineSubtotal, lineGst, subtotal, totalGst, grandTotal };
  },

  template: `
    <div class="flex flex-col h-full">
      <!-- Cart header -->
      <div class="px-4 py-3 bg-green-700 text-white font-bold text-base flex items-center gap-2 rounded-t-xl">
        <span>🛒</span>
        <span>Billing Cart</span>
        <span class="ml-auto text-sm font-normal opacity-80">{{ items.length }} item(s)</span>
      </div>

      <!-- Line items -->
      <div class="flex-1 overflow-y-auto divide-y divide-gray-100">
        <div v-if="items.length === 0" class="flex flex-col items-center justify-center py-12 text-gray-400">
          <span class="text-4xl mb-2">🧾</span>
          <p class="text-sm">Cart is empty</p>
          <p class="text-xs mt-1">Search and add medicines above</p>
        </div>

        <div
          v-for="item in items"
          :key="item.id"
          class="flex items-center gap-2 px-4 py-3"
        >
          <!-- Name + price -->
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900 truncate">{{ item.name }}</p>
            <p class="text-xs text-gray-500">₹{{ item.price }} × {{ item.qty }} + {{ item.gst }}% GST</p>
          </div>

          <!-- Qty stepper -->
          <div class="flex items-center gap-1">
            <button
              @click="$emit('update-qty', { id: item.id, qty: item.qty - 1 })"
              :disabled="item.qty <= 1"
              class="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm flex items-center justify-center disabled:opacity-40"
            >−</button>
            <span class="w-6 text-center text-sm font-semibold">{{ item.qty }}</span>
            <button
              @click="$emit('update-qty', { id: item.id, qty: item.qty + 1 })"
              class="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm flex items-center justify-center"
            >+</button>
          </div>

          <!-- Line total -->
          <div class="text-right w-16">
            <p class="text-sm font-semibold text-gray-800">₹{{ (lineSubtotal(item) + lineGst(item)).toFixed(2) }}</p>
          </div>

          <!-- Remove -->
          <button
            @click="$emit('remove-item', item.id)"
            class="text-red-400 hover:text-red-600 ml-1 text-lg leading-none"
            aria-label="Remove item"
          >×</button>
        </div>
      </div>

      <!-- Totals section -->
      <div class="border-t border-gray-200 px-4 py-3 bg-gray-50 space-y-1 rounded-b-none">
        <div class="flex justify-between text-sm text-gray-600">
          <span>Subtotal</span>
          <span>₹{{ subtotal }}</span>
        </div>
        <div class="flex justify-between text-sm text-gray-600">
          <span>GST</span>
          <span>₹{{ totalGst }}</span>
        </div>
        <div class="flex justify-between text-base font-bold text-gray-900 pt-1 border-t border-gray-300">
          <span>Total</span>
          <span class="text-green-700">₹{{ grandTotal }}</span>
        </div>
      </div>

      <!-- Checkout button -->
      <button
        @click="$emit('checkout')"
        :disabled="items.length === 0"
        class="w-full py-3.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold text-base rounded-b-xl transition focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
      >
        Checkout  ₹{{ grandTotal }}
      </button>
    </div>
  `,
});
