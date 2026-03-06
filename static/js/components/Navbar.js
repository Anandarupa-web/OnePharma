/**
 * Navbar.js – Top navigation bar
 * Renders portal-switch tabs and an auth chip (user name + logout).
 *
 * Props:
 *   views   – Array of { id, label, protected }
 *   current – ID of the active view
 *   user    – null when guest, or { name, role, avatar } when authenticated
 *
 * Emits:
 *   switch(id)  – portal tab clicked
 *   logout      – logout button clicked
 */
import { defineComponent, computed } from 'vue';
import { roleBadgeClass } from '../app.js';

export default defineComponent({
  name: 'Navbar',

  props: {
    views:   { type: Array,  required: true },
    current: { type: String, required: true },
    user:    { type: Object, default: null  },
  },

  emits: ['switch', 'logout'],

  setup(props) {
    const roleBadge = computed(() => props.user ? roleBadgeClass(props.user.role) : '');
    return { roleBadge };
  },

  template: `
    <nav class="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm no-print">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-14">

          <!-- Brand -->
          <div class="flex items-center gap-2 shrink-0">
            <span class="text-2xl">💊</span>
            <span class="font-bold text-lg text-green-700 tracking-tight">OnePharma</span>
            <span class="hidden sm:inline text-gray-400 text-sm ml-1">· Saha Pharmacy</span>
          </div>

          <!-- Portal tabs + auth chip -->
          <div class="flex items-center gap-1 sm:gap-2">

            <!-- Portal switch tabs -->
            <button
              v-for="v in views"
              :key="v.id"
              @click="$emit('switch', v.id)"
              :title="v.protected && !user ? 'Login required' : v.label"
              :class="[
                'relative px-3 py-1.5 rounded-lg text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500',
                current === v.id
                  ? 'bg-green-600 text-white shadow'
                  : 'text-gray-600 hover:bg-gray-100'
              ]"
            >
              {{ v.label }}
              <!-- Lock indicator on protected tabs when not authenticated -->
              <span
                v-if="v.protected && !user"
                class="absolute -top-1 -right-1 text-[10px] leading-none"
                aria-label="Login required"
              >🔒</span>
            </button>

            <!-- Divider -->
            <span class="hidden sm:block w-px h-5 bg-gray-200 mx-1"></span>

            <!-- Guest: login hint -->
            <span v-if="!user" class="hidden sm:inline text-xs text-gray-400">
              Click Staff / Admin to log in
            </span>

            <!-- Authenticated: user chip -->
            <div v-else class="flex items-center gap-2">
              <!-- Avatar circle -->
              <span class="w-7 h-7 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                {{ user.avatar }}
              </span>
              <div class="hidden sm:block text-left">
                <p class="text-xs font-semibold text-gray-800 leading-tight">{{ user.name }}</p>
                <span :class="['text-[10px] px-1.5 py-0.5 rounded font-medium', roleBadge]">
                  {{ user.role }}
                </span>
              </div>
              <!-- Logout -->
              <button
                @click="$emit('logout')"
                class="ml-1 text-xs text-red-500 hover:text-red-700 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 px-2 py-1 rounded"
                title="Log out"
              >
                Logout
              </button>
            </div>
          </div>

        </div>
      </div>
    </nav>
  `,
});
