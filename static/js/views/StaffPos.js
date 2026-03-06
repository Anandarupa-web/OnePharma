/**
 * StaffPos.js – Staff Operational Hub / POS Cashier View
 *
 * Desktop/Tablet: Two-column layout
 *   LEFT  – Medicine search workspace, Generic Alternatives panel, OCR scanner
 *   RIGHT – Persistent billing cart (PosCart component) + checkout modal
 *
 * Mobile: Single-column with a floating cart-total sticky bar.
 */
import { defineComponent, ref, computed } from 'vue';
import PosCart      from '../components/PosCart.js';
import ScannerModal from '../components/ScannerModal.js';
import { getInventory, saveInventory } from '../app.js';

export default defineComponent({
  name: 'StaffPos',

  components: { PosCart, ScannerModal },

  setup() {
    // ── State ──────────────────────────────────────────────────────────────
    const inventory   = ref(getInventory());
    const searchQuery = ref('');
    const cartItems   = ref([]);

    // Scanner / OCR
    const showScanner      = ref(false);
    const ocrProcessingMsg = ref('');

    // Checkout modal
    const showCheckout  = ref(false);
    const checkoutDone  = ref(false);

    // Generic alternatives panel
    const alternatives = ref([]); // array of inventory items

    // ── Computed ───────────────────────────────────────────────────────────
    /** Live-filtered search results. */
    const searchResults = computed(() => {
      const q = searchQuery.value.trim().toLowerCase();
      if (q.length < 2) return [];
      return inventory.value
        .filter((m) =>
          m.name.toLowerCase().includes(q) ||
          m.brand.toLowerCase().includes(q) ||
          m.generic.toLowerCase().includes(q)
        )
        .slice(0, 8);
    });

    /** Grand total for the floating mobile bar. */
    const mobileTotal = computed(() => {
      return cartItems.value
        .reduce((s, i) => s + i.price * i.qty * (1 + i.gst / 100), 0)
        .toFixed(2);
    });

    // ── Methods ────────────────────────────────────────────────────────────
    /** Add a medicine to the cart. Shows generic alternatives if branded. */
    const addToCart = (med) => {
      searchQuery.value = '';

      // Check if already in cart → increase qty
      const existing = cartItems.value.find((i) => i.id === med.id);
      if (existing) {
        existing.qty += 1;
      } else {
        cartItems.value.push({ id: med.id, name: med.name, price: med.price, qty: 1, gst: med.gst });
      }

      // Show generic alternatives if this is a branded medicine
      if (med.brand !== med.generic) {
        alternatives.value = inventory.value.filter(
          (m) =>
            m.ingredient === med.ingredient &&
            m.id !== med.id &&
            m.stock > 0
        );
      } else {
        alternatives.value = [];
      }
    };

    /** Cart qty update from PosCart component. */
    const updateQty = ({ id, qty }) => {
      const item = cartItems.value.find((i) => i.id === id);
      if (item) item.qty = Math.max(1, qty);
    };

    /** Remove item from cart. */
    const removeItem = (id) => {
      cartItems.value = cartItems.value.filter((i) => i.id !== id);
    };

    /** Open checkout modal. */
    const checkout = () => {
      if (cartItems.value.length === 0) return;
      showCheckout.value = true;
    };

    /** Confirm checkout – simulate invoice generation. */
    const confirmCheckout = () => {
      checkoutDone.value = true;
      // Deduct stock from inventory (persist to localStorage)
      cartItems.value.forEach((item) => {
        const med = inventory.value.find((m) => m.id === item.id);
        if (med) med.stock = Math.max(0, med.stock - item.qty);
      });
      saveInventory(inventory.value);
    };

    /** Reset after checkout completes. */
    const resetPos = () => {
      cartItems.value    = [];
      alternatives.value = [];
      checkoutDone.value = false;
      showCheckout.value = false;
    };

    /** OCR simulation – adds extracted medicines to cart. */
    const onOcrDone = (drugNames) => {
      ocrProcessingMsg.value = `✅ OCR extracted ${drugNames.length} medicines. Adding to cart…`;
      drugNames.forEach((name) => {
        const med = inventory.value.find(
          (m) => m.name.toLowerCase() === name.toLowerCase()
        );
        if (med) addToCart(med);
      });
      setTimeout(() => { ocrProcessingMsg.value = ''; }, 4000);
    };

    /** Invoice number generator. */
    const invoiceNo = () => `INV-${Date.now().toString().slice(-6)}`;

    return {
      inventory, searchQuery, searchResults,
      cartItems, mobileTotal,
      addToCart, updateQty, removeItem,
      checkout, confirmCheckout, resetPos,
      showCheckout, checkoutDone,
      showScanner, onOcrDone, ocrProcessingMsg,
      alternatives,
      invoiceNo,
    };
  },

  template: `
    <div class="min-h-[calc(100vh-3.5rem)] bg-gray-100">

      <!-- ══════════════════════════════════════════════════════
           DESKTOP / TABLET  –  Two-column layout (md and above)
           ══════════════════════════════════════════════════════ -->
      <div class="hidden md:flex h-[calc(100vh-3.5rem)]">

        <!-- LEFT WORKSPACE ─────────────────────────────────── -->
        <div class="flex-1 flex flex-col overflow-y-auto px-6 py-5 gap-4">

          <div class="flex items-center justify-between">
            <h1 class="text-xl font-bold text-gray-900">⚡ POS Billing</h1>
            <!-- OCR scanner button -->
            <button
              @click="showScanner = true"
              class="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <span>📝</span> Scan Prescription
            </button>
          </div>

          <!-- OCR result banner -->
          <div v-if="ocrProcessingMsg" class="bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-xl px-4 py-3 text-sm font-medium">
            {{ ocrProcessingMsg }}
          </div>

          <!-- Medicine search -->
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search medicine by name, brand, or generic…"
              class="w-full pl-10 pr-4 py-3 border-2 border-gray-200 focus:border-green-500 rounded-xl text-sm outline-none bg-white transition"
              autocomplete="off"
            />
          </div>

          <!-- Search results dropdown -->
          <div v-if="searchResults.length > 0" class="bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
            <div
              v-for="med in searchResults"
              :key="med.id"
              @click="addToCart(med)"
              class="flex items-center justify-between px-4 py-3 hover:bg-green-50 cursor-pointer border-b last:border-b-0 border-gray-100 transition"
            >
              <div>
                <p class="text-sm font-semibold text-gray-900">{{ med.name }}</p>
                <p class="text-xs text-gray-500">{{ med.brand }} · {{ med.category }}</p>
              </div>
              <div class="text-right shrink-0 ml-4">
                <p class="text-sm font-bold text-green-700">₹{{ med.price }}</p>
                <span :class="['text-xs font-medium', med.stock > 0 ? 'text-green-600' : 'text-red-500']">
                  {{ med.stock > 0 ? med.stock + ' in stock' : 'Out of stock' }}
                </span>
              </div>
            </div>
          </div>

          <!-- Generic Alternatives panel -->
          <div v-if="alternatives.length > 0" class="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h3 class="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
              <span>💡</span> Generic Alternatives Available
            </h3>
            <div class="space-y-2">
              <div
                v-for="alt in alternatives"
                :key="alt.id"
                class="bg-white rounded-xl px-3 py-2.5 flex items-center justify-between shadow-sm border border-blue-100"
              >
                <div>
                  <p class="text-sm font-medium text-gray-800">{{ alt.name }}</p>
                  <p class="text-xs text-gray-500">{{ alt.generic }} · {{ alt.stock }} units</p>
                </div>
                <div class="flex items-center gap-3">
                  <p class="text-sm font-bold text-blue-700">₹{{ alt.price }}</p>
                  <button
                    @click="addToCart(alt)"
                    class="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium transition"
                  >Add</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Empty workspace hint -->
          <div v-if="searchQuery.length < 2 && !alternatives.length" class="flex flex-col items-center justify-center flex-1 text-gray-400 py-10">
            <span class="text-6xl mb-3">🏪</span>
            <p class="text-sm font-medium">Type a medicine name to begin billing</p>
            <p class="text-xs mt-1">or use Scan Prescription to auto-fill via OCR</p>
          </div>
        </div>

        <!-- RIGHT CART ──────────────────────────────────────── -->
        <div class="w-80 xl:w-96 flex flex-col border-l border-gray-200 bg-white shadow-inner">
          <PosCart
            :items="cartItems"
            @update-qty="updateQty"
            @remove-item="removeItem"
            @checkout="checkout"
            class="flex-1"
          />
        </div>
      </div>


      <!-- ══════════════════════════════════════════════════════
           MOBILE  –  Single-column with floating cart bar
           ══════════════════════════════════════════════════════ -->
      <div class="md:hidden flex flex-col px-4 pt-5 pb-24 gap-4">

        <div class="flex items-center justify-between">
          <h1 class="text-xl font-bold text-gray-900">⚡ POS Billing</h1>
          <button
            @click="showScanner = true"
            class="flex items-center gap-1 bg-indigo-600 text-white text-xs font-semibold px-3 py-2 rounded-lg"
          >
            📝 Scan Rx
          </button>
        </div>

        <div v-if="ocrProcessingMsg" class="bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-xl px-4 py-3 text-sm font-medium">
          {{ ocrProcessingMsg }}
        </div>

        <!-- Mobile search -->
        <div class="relative">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search medicine…"
            class="w-full pl-10 pr-4 py-3 border-2 border-gray-200 focus:border-green-500 rounded-xl text-sm outline-none bg-white"
            autocomplete="off"
          />
        </div>

        <div v-if="searchResults.length > 0" class="bg-white rounded-xl border border-gray-200 shadow overflow-hidden">
          <div
            v-for="med in searchResults"
            :key="med.id"
            @click="addToCart(med)"
            class="flex items-center justify-between px-4 py-3 hover:bg-green-50 cursor-pointer border-b last:border-b-0 border-gray-100"
          >
            <div>
              <p class="text-sm font-semibold text-gray-900">{{ med.name }}</p>
              <p class="text-xs text-gray-500">{{ med.brand }}</p>
            </div>
            <div class="text-right shrink-0 ml-4">
              <p class="text-sm font-bold text-green-700">₹{{ med.price }}</p>
              <span :class="['text-xs', med.stock > 0 ? 'text-green-600' : 'text-red-500']">
                {{ med.stock > 0 ? med.stock + ' left' : 'Out' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Generic alternatives mobile -->
        <div v-if="alternatives.length > 0" class="bg-blue-50 border border-blue-200 rounded-xl p-3">
          <p class="text-xs font-bold text-blue-800 mb-2">💡 Generic alternatives:</p>
          <div class="space-y-2">
            <div v-for="alt in alternatives" :key="alt.id" class="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-blue-100">
              <div>
                <p class="text-xs font-medium text-gray-800">{{ alt.name }}</p>
                <p class="text-xs text-gray-400">₹{{ alt.price }}</p>
              </div>
              <button @click="addToCart(alt)" class="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg">Add</button>
            </div>
          </div>
        </div>

        <!-- Cart list mobile -->
        <div v-if="cartItems.length > 0" class="bg-white rounded-xl border border-gray-200 shadow overflow-hidden">
          <div class="px-4 py-2 bg-green-700 text-white text-sm font-bold">🛒 Cart ({{ cartItems.length }} items)</div>
          <div v-for="item in cartItems" :key="item.id" class="flex items-center px-4 py-3 border-b last:border-b-0 border-gray-100 gap-2">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 truncate">{{ item.name }}</p>
              <p class="text-xs text-gray-500">₹{{ item.price }} × {{ item.qty }}</p>
            </div>
            <button @click="removeItem(item.id)" class="text-red-400 hover:text-red-600 text-lg">×</button>
          </div>
        </div>
      </div>

      <!-- Floating checkout bar (mobile) -->
      <div v-if="cartItems.length > 0" class="md:hidden fixed bottom-0 left-0 right-0 bg-green-700 text-white px-4 py-3 flex items-center justify-between shadow-lg z-30">
        <span class="text-sm">{{ cartItems.length }} item(s) · <strong>₹{{ mobileTotal }}</strong></span>
        <button
          @click="checkout"
          class="bg-white text-green-700 font-bold text-sm px-4 py-2 rounded-lg"
        >
          Checkout →
        </button>
      </div>


      <!-- ══════════════════════════════════════════════════════
           OCR SCANNER MODAL
           ══════════════════════════════════════════════════════ -->
      <ScannerModal
        v-model:show="showScanner"
        title="Scan Handwritten Prescription"
        mode="staff"
        @ocr-done="onOcrDone"
      />


      <!-- ══════════════════════════════════════════════════════
           CHECKOUT MODAL
           ══════════════════════════════════════════════════════ -->
      <Transition name="fade">
        <div
          v-if="showCheckout"
          class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          @click.self="!checkoutDone && (showCheckout = false)"
        >
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">

            <!-- ── PRE-CONFIRM state ── -->
            <template v-if="!checkoutDone">
              <h2 class="text-lg font-bold text-gray-900 mb-1">Confirm Checkout</h2>
              <p class="text-sm text-gray-500 mb-4">Review and confirm the order to generate an invoice.</p>

              <ul class="divide-y divide-gray-100 mb-4 text-sm max-h-48 overflow-y-auto">
                <li v-for="item in cartItems" :key="item.id" class="flex justify-between py-2">
                  <span class="text-gray-700">{{ item.name }} × {{ item.qty }}</span>
                  <span class="font-medium text-gray-900">₹{{ (item.price * item.qty * (1 + item.gst / 100)).toFixed(2) }}</span>
                </li>
              </ul>

              <div class="flex gap-3">
                <button
                  @click="showCheckout = false"
                  class="flex-1 py-2.5 border-2 border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition"
                >Cancel</button>
                <button
                  @click="confirmCheckout"
                  class="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition"
                >Confirm &amp; Pay</button>
              </div>
            </template>

            <!-- ── POST-CONFIRM (success) state ── -->
            <template v-else>
              <div class="text-center py-4">
                <div class="text-6xl mb-3">🎉</div>
                <h2 class="text-xl font-bold text-green-700 mb-1">Payment Successful!</h2>
                <p class="text-sm text-gray-500 mb-1">Invoice <strong>{{ invoiceNo() }}</strong> generated.</p>
                <p class="text-xs text-gray-400 mb-5">A digital dosage slip has been sent to the patient's portal.</p>

                <div class="flex flex-col gap-2">
                  <button
                    class="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2"
                    @click="() => alert('PDF download will be available once the Flask backend is integrated in Phase 2.')"
                  >
                    <span>📄</span> Download PDF Invoice
                  </button>
                  <button
                    @click="resetPos"
                    class="w-full py-2.5 border-2 border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition"
                  >
                    New Transaction
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </Transition>

    </div>
  `,
});
