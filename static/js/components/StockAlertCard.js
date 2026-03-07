/**
 * StockAlertCard.js – Reusable alert card for low-stock / expiry warnings.
 * Used in the Admin Dashboard Alerts Centre.
 *
 * Props:
 *   medicine  – name string
 *   type      – 'low-stock' | 'expiry'
 *   detail    – secondary detail string (e.g., "8 units left (min 15)" or "Expires 01-Apr-2025")
 */
import { defineComponent, computed } from 'vue';

export default defineComponent({
  name: 'StockAlertCard',

  props: {
    medicine: { type: String, required: true },
    type:     { type: String, required: true }, // 'low-stock' | 'expiry'
    detail:   { type: String, required: true },
  },

  setup(props) {
    /** Derived colours and icon based on alert type. */
    const config = computed(() => {
      if (props.type === 'low-stock') {
        return {
          bg:     'bg-red-50 border-red-300',
          badge:  'bg-red-100 text-red-700',
          icon:   '📦',
          label:  'Low Stock',
          textColor: 'text-red-800',
        };
      }
      return {
        bg:     'bg-amber-50 border-amber-300',
        badge:  'bg-amber-100 text-amber-700',
        icon:   '⏰',
        label:  'Near Expiry',
        textColor: 'text-amber-800',
      };
    });

    return { config };
  },

  template: `
    <div :class="['border rounded-xl p-4 flex items-start gap-3', config.bg]">
      <span class="text-2xl mt-0.5" role="img" :aria-label="config.label">{{ config.icon }}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-semibold text-gray-900 text-sm">{{ medicine }}</span>
          <span :class="['text-xs px-2 py-0.5 rounded-full font-medium', config.badge]">
            {{ config.label }}
          </span>
        </div>
        <p :class="['text-xs mt-1', config.textColor]">{{ detail }}</p>
      </div>
    </div>
  `,
});
