/**
 * Navbar.js – Top navigation bar
 * Renders portal-switch tabs at the top of every view.
 * Emits a "switch" event with the chosen portal ID on click.
 */
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'Navbar',

  props: {
    /** Array of { id, label, icon } – one per portal. */
    views:   { type: Array,  required: true },
    /** ID of the currently active portal. */
    current: { type: String, required: true },
  },

  emits: ['switch'],

  template: `
    <nav class="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm no-print">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-14">

          <!-- Brand name -->
          <div class="flex items-center gap-2">
            <span class="text-2xl">💊</span>
            <span class="font-bold text-lg text-green-700 tracking-tight">
              OnePharma
            </span>
            <span class="hidden sm:inline text-gray-400 text-sm ml-1">· Saha Pharmacy</span>
          </div>

          <!-- Portal switch tabs -->
          <div class="flex items-center gap-1 sm:gap-2">
            <button
              v-for="v in views"
              :key="v.id"
              @click="$emit('switch', v.id)"
              :class="[
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500',
                current === v.id
                  ? 'bg-green-600 text-white shadow'
                  : 'text-gray-600 hover:bg-gray-100'
              ]"
            >
              {{ v.label }}
            </button>
          </div>
        </div>
      </div>
    </nav>
  `,
});
